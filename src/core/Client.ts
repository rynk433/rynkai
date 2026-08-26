import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type AnyMessageContent,
  type WAPresence,
  type GroupMetadata,
  type ParticipantAction,
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
import { SendQueue } from './SendQueue';
import { downloadMedia } from '../media/downloadMedia';

export interface GroupParticipantsEvent {
  groupId: string;
  action: ParticipantAction;
  participants: string[];
}

export interface RynkaiEvents {
  ready: () => void;
  message: (msg: NormalizedMessage) => void;
  disconnected: (reason: string) => void;
  qr: (qr: string) => void;
  pairingCode: (code: string) => void;
  'group-participants-update': (event: GroupParticipantsEvent) => void;
}

/**
 * Client utama rynkai. Bungkus WASocket Baileys dan expose API yang lebih
 * sederhana: client.on('message', ...), client.send(...), plugin otomatis
 * ke-dispatch kalau prefix cocok.
 */
export class Client extends EventEmitter {
  public sock: WASocket | null = null;
  public readonly plugins = new PluginLoader();

  private config: Required<Omit<RynkaiConfig, 'pairingCode' | 'sessionStore' | 'rateLimit' | 'sendQueue' | 'autoRead'>> &
    Pick<RynkaiConfig, 'pairingCode' | 'sessionStore' | 'rateLimit' | 'sendQueue' | 'autoRead'>;
  private sessionStore: FileSessionStore | NonNullable<RynkaiConfig['sessionStore']>;
  private logger: pino.Logger;
  private middlewares: Middleware[] = [];
  private rateLimiter: RateLimiter | null;
  private sendQueue: SendQueue;

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
      sendQueue: config.sendQueue,
      autoRead: config.autoRead ?? false,
    };
    this.sessionStore = config.sessionStore ?? new FileSessionStore(config.sessionName);
    this.logger = pino({ level: this.config.logLevel });
    this.rateLimiter = config.rateLimit ? new RateLimiter(config.rateLimit) : null;
    this.sendQueue = new SendQueue(config.sendQueue);
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

        if (this.config.autoRead && !message.fromMe) {
          await this.markAsRead(message).catch((err) => this.logger.error(err, 'gagal markAsRead'));
        }

        await this.dispatchPlugin(message);
      }
    });

    this.sock.ev.on('group-participants.update', (event) => {
      this.emit('group-participants-update', {
        groupId: event.id,
        action: event.action,
        participants: event.participants,
      });
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

  /** Kirim pesan ke sebuah chat. Otomatis di-throttle lewat send queue biar tidak spam ke WA. */
  async send(chatId: string, content: AnyMessageContent): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    const sock = this.sock;
    await this.sendQueue.push(() => sock.sendMessage(chatId, content));
  }

  /** Balas sebuah NormalizedMessage, otomatis quote pesan aslinya. Ikut lewat send queue juga. */
  async reply(message: NormalizedMessage, text: string): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    const sock = this.sock;
    await this.sendQueue.push(() => sock.sendMessage(message.chatId, { text }, { quoted: message.raw }));
  }

  /** Download media (image/video/audio/sticker/document) dari sebuah pesan sebagai Buffer. */
  async downloadMedia(message: NormalizedMessage): Promise<Buffer> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    return downloadMedia(message, this.sock, this.logger);
  }

  /** Beri reaction emoji ke sebuah pesan. Lewat send queue juga (throttle sama seperti send/reply). */
  async react(message: NormalizedMessage, emoji: string): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    const sock = this.sock;
    await this.sendQueue.push(() =>
      sock.sendMessage(message.chatId, { react: { text: emoji, key: message.raw.key } })
    );
  }

  /** Hapus reaction yang sudah dikirim ke sebuah pesan. */
  async removeReaction(message: NormalizedMessage): Promise<void> {
    await this.react(message, '');
  }

  /**
   * Tandai satu atau beberapa pesan sebagai sudah dibaca (centang biru).
   * Terima satu NormalizedMessage atau array.
   */
  async markAsRead(message: NormalizedMessage | NormalizedMessage[]): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    const messages = Array.isArray(message) ? message : [message];
    await this.sock.readMessages(messages.map((m) => m.raw.key));
  }

  /** Update presence (online/typing/recording/dst) di sebuah chat. */
  async sendPresence(chatId: string, presence: WAPresence): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    await this.sock.sendPresenceUpdate(presence, chatId);
  }

  /**
   * Tampilkan indikator "sedang mengetik" di sebuah chat selama `durationMs`,
   * lalu otomatis kembali ke status paused. Default durasi 1000ms.
   */
  async sendTyping(chatId: string, durationMs = 1000): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    await this.sock.sendPresenceUpdate('composing', chatId);
    await new Promise((r) => setTimeout(r, durationMs));
    await this.sock.sendPresenceUpdate('paused', chatId);
  }

  /** Ambil metadata sebuah grup (nama, deskripsi, daftar participant, admin, dst). */
  async getGroupMetadata(groupId: string): Promise<GroupMetadata> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    return this.sock.groupMetadata(groupId);
  }

  /** Tambah participant ke grup. */
  async addParticipants(groupId: string, participants: string[]): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    await this.sock.groupParticipantsUpdate(groupId, participants, 'add');
  }

  /** Keluarkan participant dari grup. */
  async removeParticipants(groupId: string, participants: string[]): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    await this.sock.groupParticipantsUpdate(groupId, participants, 'remove');
  }

  /** Jadikan participant admin grup. */
  async promoteParticipants(groupId: string, participants: string[]): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    await this.sock.groupParticipantsUpdate(groupId, participants, 'promote');
  }

  /** Turunkan admin grup jadi member biasa. */
  async demoteParticipants(groupId: string, participants: string[]): Promise<void> {
    if (!this.sock) throw new Error('Client belum connect. Panggil connect() dulu.');
    await this.sock.groupParticipantsUpdate(groupId, participants, 'demote');
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
