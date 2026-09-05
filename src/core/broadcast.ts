export interface BroadcastResult {
  chatId: string;
  success: boolean;
  error?: unknown;
}

export interface BroadcastProgress {
  /** Jumlah chat yang sudah diproses (berhasil maupun gagal) */
  sent: number;
  /** Total chat yang jadi target broadcast */
  total: number;
  /** Hasil pengiriman ke chat yang baru saja diproses */
  current: BroadcastResult;
}

/**
 * Jalankan pengiriman ke banyak chatId secara berurutan, panggil sendFn
 * untuk tiap chat, dan laporkan progress lewat callback opsional. Satu
 * chat gagal tidak menghentikan broadcast — chat berikutnya tetap diproses.
 *
 * Dipisah dari Client supaya logic ini bisa di-test tanpa perlu koneksi
 * WhatsApp asli (sendFn di-mock di test).
 */
export async function runBroadcast(
  chatIds: string[],
  sendFn: (chatId: string) => Promise<void>,
  onProgress?: (progress: BroadcastProgress) => void
): Promise<BroadcastResult[]> {
  const results: BroadcastResult[] = [];

  for (let i = 0; i < chatIds.length; i++) {
    const chatId = chatIds[i];
    let result: BroadcastResult;

    try {
      await sendFn(chatId);
      result = { chatId, success: true };
    } catch (error) {
      result = { chatId, success: false, error };
    }

    results.push(result);
    onProgress?.({ sent: i + 1, total: chatIds.length, current: result });
  }

  return results;
}
