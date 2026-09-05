import { describe, it, expect, vi } from 'vitest';
import { runBroadcast } from './broadcast';

describe('runBroadcast', () => {
  it('mengirim ke semua chatId secara berurutan', async () => {
    const sent: string[] = [];
    const sendFn = vi.fn(async (chatId: string) => {
      sent.push(chatId);
    });

    const results = await runBroadcast(['a', 'b', 'c'], sendFn);

    expect(sent).toEqual(['a', 'b', 'c']);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('mencatat chat yang gagal tanpa menghentikan chat berikutnya', async () => {
    const sendFn = vi.fn(async (chatId: string) => {
      if (chatId === 'b') throw new Error('gagal kirim ke b');
    });

    const results = await runBroadcast(['a', 'b', 'c'], sendFn);

    expect(sendFn).toHaveBeenCalledTimes(3); // tetap lanjut ke 'c' walau 'b' gagal
    expect(results[0]).toEqual({ chatId: 'a', success: true });
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBeInstanceOf(Error);
    expect(results[2]).toEqual({ chatId: 'c', success: true });
  });

  it('memanggil onProgress setelah tiap chat diproses, dengan angka yang benar', async () => {
    const sendFn = vi.fn(async () => {});
    const onProgress = vi.fn();

    await runBroadcast(['a', 'b'], sendFn, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      sent: 1,
      total: 2,
      current: { chatId: 'a', success: true },
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      sent: 2,
      total: 2,
      current: { chatId: 'b', success: true },
    });
  });

  it('return array kosong untuk daftar chatId kosong, tanpa memanggil sendFn', async () => {
    const sendFn = vi.fn(async () => {});
    const results = await runBroadcast([], sendFn);

    expect(results).toEqual([]);
    expect(sendFn).not.toHaveBeenCalled();
  });

  it('onProgress bersifat opsional, tidak error kalau tidak diisi', async () => {
    const sendFn = vi.fn(async () => {});
    await expect(runBroadcast(['a'], sendFn)).resolves.toHaveLength(1);
  });
});
