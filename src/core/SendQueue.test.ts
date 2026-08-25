import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SendQueue } from './SendQueue';

describe('SendQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('menjalankan task dan resolve dengan hasilnya', async () => {
    const queue = new SendQueue({ intervalMs: 100 });
    const result = await queue.push(async () => 'hasil');
    expect(result).toBe('hasil');
  });

  it('menjalankan task secara berurutan (FIFO) dengan jeda antar task', async () => {
    const queue = new SendQueue({ intervalMs: 100 });
    const order: number[] = [];

    const p1 = queue.push(async () => {
      order.push(1);
    });
    const p2 = queue.push(async () => {
      order.push(2);
    });
    const p3 = queue.push(async () => {
      order.push(3);
    });

    await vi.runAllTimersAsync();
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('reject promise kalau task melempar error, tapi tidak menghentikan antrian', async () => {
    const queue = new SendQueue({ intervalMs: 10 });
    const order: string[] = [];

    const p1 = queue.push(async () => {
      throw new Error('task 1 gagal');
    });
    p1.catch(() => {}); // pasang handler segera, cegah warning unhandled rejection dari Node

    const p2 = queue.push(async () => {
      order.push('task2 jalan');
    });

    await vi.runAllTimersAsync();

    await expect(p1).rejects.toThrow('task 1 gagal');
    await expect(p2).resolves.toBeUndefined();
    expect(order).toEqual(['task2 jalan']);
  });

  it('pending mencerminkan jumlah task yang masih menunggu', async () => {
    const queue = new SendQueue({ intervalMs: 1000 });

    queue.push(async () => {});
    queue.push(async () => {});
    const thirdTask = queue.push(async () => {});

    // task pertama langsung mulai diproses, sisanya nunggu di antrian
    expect(queue.pending).toBeGreaterThanOrEqual(1);

    await vi.runAllTimersAsync();
    await thirdTask;

    expect(queue.pending).toBe(0);
  });
});
