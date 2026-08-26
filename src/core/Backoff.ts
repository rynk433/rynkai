export interface BackoffConfig {
  /** Jeda awal dalam ms sebelum percobaan reconnect pertama. Default: 1000 */
  initialDelayMs?: number;
  /** Jeda maksimum dalam ms, backoff tidak akan melebihi ini. Default: 30000 */
  maxDelayMs?: number;
  /** Maksimal jumlah percobaan reconnect sebelum menyerah. Default: Infinity (tidak pernah menyerah) */
  maxRetries?: number;
}

/**
 * Hitung jeda exponential backoff dengan sedikit jitter (variasi acak),
 * biar reconnect tidak instan beruntun (yang bisa bikin WA curiga/flag akun)
 * dan tidak "thundering herd" kalau banyak instance reconnect bareng.
 */
export class Backoff {
  private attempt = 0;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxRetries: number;

  constructor(config: BackoffConfig = {}) {
    this.initialDelayMs = config.initialDelayMs ?? 1000;
    this.maxDelayMs = config.maxDelayMs ?? 30_000;
    this.maxRetries = config.maxRetries ?? Infinity;
  }

  /** Apakah masih boleh mencoba reconnect lagi. */
  canRetry(): boolean {
    return this.attempt < this.maxRetries;
  }

  /** Jumlah percobaan yang sudah dilakukan sejauh ini. */
  get attemptCount(): number {
    return this.attempt;
  }

  /**
   * Hitung jeda berikutnya (ms) dan naikkan counter percobaan.
   * Rumus: min(initialDelay * 2^attempt, maxDelay) + jitter acak 0-30%.
   */
  next(): number {
    const exponential = this.initialDelayMs * Math.pow(2, this.attempt);
    const capped = Math.min(exponential, this.maxDelayMs);
    const jitter = capped * 0.3 * Math.random();
    this.attempt++;
    return Math.round(capped + jitter);
  }

  /** Reset counter percobaan ke 0, dipanggil setelah koneksi berhasil lagi. */
  reset(): void {
    this.attempt = 0;
  }
}
