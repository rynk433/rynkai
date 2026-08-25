import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type AnyMessageContent,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { EventEmitter } from 'events';
import pino from 'pino';

import type { NormalizedMessage, RynkaiConfig, PluginContext } from '../types';
import { FileSessionStore } from '../session/FileSessionStore';
import { parseMessage } from '../message/MessageParser';
import { PluginLoader } from '../plugin/PluginLoader';
import { compose, type Middleware } from './Middleware';
import { RateLimiter } from './RateLimiter';

export interface RynkaiEvents {
  ready: () => void;
  message: (msg: NormalizedMessage) => void;
  disconnected: (reason: string) => void;
  qr: (qr: string) => void;
  pairingCode: (code: string) => void;
}

/**
 * Client utama rynkai. Bungkus WASocket Baileys dan expose API yang lebih
 * sederhana: client.on('message', ...), client.send(...), plugin otomatis
 * ke-dispatch kalau prefix cocok.
 */
export class Client extends EventEmitter {
  public sock: WASocket | null = null;
  public readonly plugins = new PluginLoader();

  private config: Required<Omit<RynkaiConfig, 'pairingCode' | 'sessionStore' | 'rateLimit'>> &
    Pick<RynkaiConfig, 'pairingCode' | 'sessionStore' | 'rateLimit'>;
  private sessionStore: FileSessionStore | NonNullable<RynkaiConfig['sessionStore']>;
  private logger: pino.Logger;
  private middlewares: Middleware[] = [];
  private rateLimiter: RateLimiter | null;

  constructor(config: RynkaiConfig) {
    super();
    this.config = {
      prefix: '.',
      printQR: !config.pairingCode,
      logLevel: 'silent',
      pairingCode: config.pairingCode,
      sessionStore: config.sessionStore,
      sessionName: config.sessionName,
      rateLimit: config.rateLimit,
    };
    this.sessionStore = config.sessionStore ?? new FileSessionStore(config.sessionName);
    this.logger = pino({ level: this.config.logLevel });
    this.rateLimiter = config.rateLimit ? new RateLimiter(config.rateLimit) : null;
  }

  /**
   * Daftarkan middleware yang jalan sebelum (dan bisa membungkus) eksekusi plugin.
   * Dipanggil untuk semua pesan yang cocok prefix, terlepas plugin-nya ada atau tidak
   * dalam urutan pendaftaran (onion model). Chainable.
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /** Konek ke WhatsApp. Resolve setelah koneksi berhasil "open". */
  async connect(): Promise<void> {
    const state = await this.sessionStore.load();
    if (!state) {
      throw new Error('SessionStore.load() mengembalikan null — pastikan implementasinya benar.');
    }

    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      logger: this.logger,
      printQRInTerminal: false, // kita handle sendiri lewat event 'qr'
    });

    this.sock.ev.on('creds.update', async () => {
      await this.sessionStore.save(state);
    });

    if (this.config.pairingCode && !this.sock.authState.creds.registered) {
      const code = await this.sock.requestPairingCode(this.config.pairingCode.phoneNumber);
      this.emit('pairingCode', code);
    }

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && this.config.printQR) {
        this.emit('qr', qr);
      }

      if (connection === 'open') {
        this.emit('ready');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        this.emit('disconnected', String(statusCode ?? 'unknown'));

        if (shouldReconnect) {
          this.connect().catch((err) => this.logger.error(err, 'gagal reconnect'));
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const raw of messages) {
        if (!raw.message) continue;
        const message = parseMessage(raw);
        this.emit('message', message);
        await this.dispatchPlugin(message);
      }
    });
  }

  /** Cocokkan pesan terhadap prefix & jalankan plugin yang sesuai, kalau ada. */
  private async dispatchPlugin(message: NormalizedMessage): Promise<void> {
    if (message.fromMe) return;
    if (!message.text.startsWith(this.config.prefix)) return;

    const withoutPrefix = message.text.slice(this.config.prefix.length).trim();
    const [command, ...args] = withoutPrefix.split(/\s+/);
    if (!command) return;

    const ctx: PluginContext = {
      client: this.sock!,
      message,
      args,
      reply: (text: string) => this.reply(message, text),
    };

    // Rate limit global dicek duluan, sebelum middleware/plugin apapun jalan.
    if (this.rateLimiter && !this.rateLimiter.consume(message.sender)) {
      const retryAfter = this.rateLimiter.retryAfter(message.sender);
      await ctx.reply(`Terlalu banyak perintah. Coba lagi dalam ${retryAfter} detik.`);
      return;
    }

    const pipeline = compose(this.middlewares, async () => {
      await this.plugins.execute(command, ctx);
    });

    await pipeline(ctx);
  }

  /** Kirim pesan ke sebuah chat. Wrapper tipis di atas sock.sendMessage. */
  async send(chatId: string, content: AnyMessageContent): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    await this.sock.sendMessage(chatId, content);
  }

  /** Balas sebuah NormalizedMessage, otomatis quote pesan aslinya. */
  async reply(message: NormalizedMessage, text: string): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    await this.sock.sendMessage(message.chatId, { text }, { quoted: message.raw });
  }

  /** Logout & bersihkan sesi tersimpan. */
  async logout(): Promise<void> {
    await this.sock?.logout();
    await this.sessionStore.clear();
  }

  // Type-safe event emitter overrides
  on<K extends keyof RynkaiEvents>(event: K, listener: RynkaiEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
  emit<K extends keyof RynkaiEvents>(event: K, ...args: Parameters<RynkaiEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
}
