import type { Middleware } from './Middleware';

export type AccessControlMode = 'blocklist' | 'whitelist';

export interface AccessControlConfig {
  /**
   * 'blocklist' (default): semua JID boleh pakai bot KECUALI yang ada di list.
   * 'whitelist': semua JID diblokir KECUALI yang ada di list.
   */
  mode?: AccessControlMode;
  /** Daftar awal JID (user atau grup, bisa dicampur). */
  initial?: string[];
  /**
   * Pesan yang dikirim ke JID yang diblokir. Default: tidak ada balasan sama
   * sekali (silent) — command diam-diam tidak dijalankan.
   */
  replyMessage?: string;
}

/**
 * Kelola daftar blokir/izin untuk user & group JID, dan sediakan sebagai
 * middleware siap pakai lewat client.use(). Satu instance bisa dipakai untuk
 * JID user maupun grup sekaligus (keduanya cuma string JID, dibedakan
 * suffix "@s.whatsapp.net" vs "@g.us").
 *
 * Mode blocklist (paling umum — bot terbuka untuk semua, kecuali yang di-block):
 * ```ts
 * const acl = new AccessControl({ mode: 'blocklist', replyMessage: 'Kamu diblokir dari bot ini.' });
 * acl.block('628123456789@s.whatsapp.net');
 * bot.use(acl.middleware());
 * ```
 *
 * Mode whitelist (bot privat — cuma JID tertentu yang boleh pakai):
 * ```ts
 * const acl = new AccessControl({ mode: 'whitelist' });
 * acl.allow('628123456789@s.whatsapp.net');
 * acl.allow('120363000000000000@g.us'); // izinkan satu grup spesifik
 * bot.use(acl.middleware());
 * ```
 */
export class AccessControl {
  private mode: AccessControlMode;
  private entries: Set<string>;
  private replyMessage?: string;

  constructor(config: AccessControlConfig = {}) {
    this.mode = config.mode ?? 'blocklist';
    this.entries = new Set(config.initial ?? []);
    this.replyMessage = config.replyMessage;
  }

  /** Tambah JID ke daftar. Di mode blocklist ini artinya "blokir", di mode whitelist artinya "izinkan". */
  add(jid: string): void {
    this.entries.add(jid);
  }

  /** Alias add() — lebih intuitif dipakai di mode blocklist. */
  block(jid: string): void {
    this.add(jid);
  }

  /** Alias add() — lebih intuitif dipakai di mode whitelist. */
  allow(jid: string): void {
    this.add(jid);
  }

  /** Hapus JID dari daftar. */
  remove(jid: string): void {
    this.entries.delete(jid);
  }

  /** Alias remove() — lebih intuitif dipakai di mode blocklist. */
  unblock(jid: string): void {
    this.remove(jid);
  }

  /** Alias remove() — lebih intuitif dipakai di mode whitelist. */
  disallow(jid: string): void {
    this.remove(jid);
  }

  /** Cek apakah JID ada di daftar (terlepas dari mode aktif). */
  has(jid: string): boolean {
    return this.entries.has(jid);
  }

  /** Semua JID yang ada di daftar saat ini. */
  list(): string[] {
    return [...this.entries];
  }

  /** True kalau JID ini boleh pakai bot, sesuai mode aktif saat ini. */
  isAllowed(jid: string): boolean {
    const inList = this.entries.has(jid);
    return this.mode === 'blocklist' ? !inList : inList;
  }

  /**
   * Ubah instance ini jadi Middleware siap pakai lewat client.use().
   * Mengecek sender (JID pengirim) DAN chatId (JID grup kalau di grup) —
   * keduanya harus lolos supaya command diteruskan ke plugin.
   */
  middleware(): Middleware {
    return async (ctx, next) => {
      const { sender, chatId } = ctx.message;

      if (!this.isAllowed(sender) || !this.isAllowed(chatId)) {
        if (this.replyMessage) {
          await ctx.reply(this.replyMessage);
        }
        return; // next() tidak dipanggil — command tidak diteruskan ke plugin
      }

      await next();
    };
  }
}
