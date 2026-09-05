import type { WASocket, AuthenticationState, proto } from '@whiskeysockets/baileys';

/** Jenis pesan yang sudah dinormalisasi, dipakai di seluruh library (bukan raw proto Baileys) */
export type NormalizedMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'sticker'
  | 'document'
  | 'location'
  | 'contact'
  | 'reaction'
  | 'poll'
  | 'unknown';

export interface NormalizedMessage {
  /** ID unik pesan dari WhatsApp */
  id: string;
  /** JID pengirim (selalu individual, walau dari grup) */
  sender: string;
  /** JID chat asal (bisa grup atau individual) */
  chatId: string;
  /** true kalau pesan datang dari grup */
  isGroup: boolean;
  /** Tipe pesan yang sudah disederhanakan */
  type: NormalizedMessageType;
  /** Isi teks (caption untuk media, body untuk text) */
  text: string;
  /** true kalau pesan ini dari bot sendiri */
  fromMe: boolean;
  /** Unix timestamp (detik) */
  timestamp: number;
  /**
   * true kalau ini pesan "lihat sekali" (view once) — image/video yang cuma
   * bisa dibuka sekali di WhatsApp resmi. `type` tetap menunjukkan tipe
   * konten aslinya (image/video/dst), field ini cuma penanda tambahan.
   */
  isViewOnce: boolean;
  /** Pesan yang di-quote/reply, kalau ada (sudah dinormalisasi juga, minus quotedMessage-nya sendiri) */
  quoted: Omit<NormalizedMessage, 'quoted'> | null;
  /** Detail reaction, terisi hanya kalau type === 'reaction' (orang lain react ke suatu pesan) */
  reaction: { targetMessageId: string; emoji: string } | null;
  /**
   * Kontak yang di-share (satu atau lebih), terisi hanya kalau type === 'contact'.
   * Setiap entry punya vcard mentah — pakai extractPhoneFromVCard() untuk ambil nomornya.
   */
  contacts: { displayName: string; vcard: string }[] | null;
  /** Raw proto message asli dari Baileys, buat kasus yang butuh akses low-level */
  raw: proto.IWebMessageInfo;
}

export interface SessionStore {
  /** Load auth state tersimpan. Return null kalau belum ada sesi. */
  load(): Promise<AuthenticationState | null>;
  /** Simpan/update auth state (dipanggil tiap ada perubahan credential/keys) */
  save(state: AuthenticationState): Promise<void>;
  /** Hapus sesi tersimpan (dipanggil saat logout) */
  clear(): Promise<void>;
}

export interface PluginContext {
  client: WASocket;
  message: NormalizedMessage;
  args: string[];
  /** Reply cepat ke chat asal pesan, otomatis quote pesan yang memicu */
  reply: (text: string) => Promise<void>;
}

export interface Plugin {
  name: string;
  command: string | string[];
  category?: string;
  description?: string;
  /** Cooldown per-user dalam detik, opsional */
  cooldown?: number;
  execute: (ctx: PluginContext) => Promise<void> | void;
}

export interface RynkaiConfig {
  /** Nama sesi, dipakai sebagai default folder/key penyimpanan */
  sessionName: string;
  /** Session store custom. Default: FileSessionStore */
  sessionStore?: SessionStore;
  /** Prefix command untuk plugin, default "." */
  prefix?: string;
  /** Pakai pairing code (nomor HP) alih-alih QR */
  pairingCode?: {
    phoneNumber: string;
  };
  /** Cetak QR ke terminal, default true kalau tidak pakai pairingCode */
  printQR?: boolean;
  /** Level log Baileys/pino, default "silent" */
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /**
   * Rate limit global per user (terpisah dari cooldown per-plugin).
   * Kalau tidak diisi, tidak ada rate limit global yang aktif.
   */
  rateLimit?: {
    /** Maksimal command dalam satu window */
    max: number;
    /** Panjang window dalam milidetik */
    windowMs: number;
  };
  /** Konfigurasi throttle pengiriman pesan (send queue). Default: jeda 250ms antar pesan. */
  sendQueue?: {
    intervalMs?: number;
  };
  /** Otomatis tandai setiap pesan masuk sebagai sudah dibaca (centang biru). Default: false. */
  autoRead?: boolean;
  /**
   * Konfigurasi backoff untuk auto-reconnect saat koneksi putus (bukan karena logout manual).
   * Default: jeda mulai 1 detik, naik exponential sampai maksimal 30 detik, tidak ada batas percobaan.
   */
  reconnect?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    maxRetries?: number;
  };
}
