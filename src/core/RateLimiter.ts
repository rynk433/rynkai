export interface RateLimitConfig {
  /** Maksimal jumlah command yang boleh dijalankan dalam satu window */
  max: number;
  /** Panjang window dalam milidetik */
  windowMs: number;
}

/**
 * Rate limiter global berbasis fixed window, per user (bukan per-plugin
 * seperti cooldown di PluginLoader). Cocok buat cegah spam command
 * bertubi-tubi dari satu user, terlepas dari command apa yang dipanggil.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private config: RateLimitConfig) {}

  /**
   * Catat satu request dari user. Return true kalau masih dalam limit
   * (request dihitung), false kalau user sudah kena limit.
   */
  consume(userId: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(userId);

    if (!entry || now >= entry.resetAt) {
      this.hits.set(userId, { count: 1, resetAt: now + this.config.windowMs });
      return true;
    }

    if (entry.count >= this.config.max) {
      return false;
    }

    entry.count++;
    return true;
  }

  /** Sisa waktu dalam detik sebelum limit user ini reset. 0 kalau tidak sedang kena limit. */
  retryAfter(userId: string): number {
    const entry = this.hits.get(userId);
    if (!entry) return 0;
    return Math.max(0, Math.ceil((entry.resetAt - Date.now()) / 1000));
  }
}
