export interface SendQueueConfig {
  /** Jeda minimum antar pengiriman pesan, dalam milidetik. Default: 250ms */
  intervalMs?: number;
}

interface QueuedTask<T> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

/**
 * Antrian FIFO buat pengiriman pesan, dengan jeda minimum antar item.
 * Baileys/WA bisa nge-flag akun kalau kirim banyak pesan secara instan
 * beruntun (misal broadcast ke banyak chat) — queue ini bikin semua
 * pengiriman lewat client.send() otomatis di-throttle tanpa perlu
 * consumer mikirin delay manual.
 */
export class SendQueue {
  private queue: QueuedTask<unknown>[] = [];
  private processing = false;
  private intervalMs: number;

  constructor(config: SendQueueConfig = {}) {
    this.intervalMs = config.intervalMs ?? 250;
  }

  /** Masukkan task ke antrian. Resolve/reject sesuai hasil task saat gilirannya jalan. */
  push<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject } as QueuedTask<unknown>);
      void this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await item.task();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }

      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.intervalMs));
      }
    }

    this.processing = false;
  }

  /** Jumlah task yang masih menunggu di antrian (tidak termasuk yang sedang jalan) */
  get pending(): number {
    return this.queue.length;
  }
}
