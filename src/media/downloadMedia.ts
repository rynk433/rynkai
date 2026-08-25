import { downloadMediaMessage, type WAMessage, type WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import type { NormalizedMessage } from '../types';

const MEDIA_TYPES = ['image', 'video', 'audio', 'sticker', 'document'] as const;
const defaultLogger = pino({ level: 'silent' });

/**
 * Download media (image/video/audio/sticker/document) dari sebuah pesan
 * dan return langsung sebagai Buffer. Di Baileys mentah ini butuh beberapa
 * baris boilerplate (downloadContentFromMessage + stream ke buffer manual);
 * di sini tinggal satu panggilan.
 *
 * `sock` diperlukan supaya media yang sudah expired di server WA bisa
 * di-reupload-request otomatis oleh Baileys (dipakai `client.downloadMedia()`,
 * yang otomatis mengoper socket aktifnya).
 *
 * @throws Error kalau pesan bukan tipe media (text, location, dll)
 */
export async function downloadMedia(message: NormalizedMessage, sock: WASocket, logger?: pino.Logger): Promise<Buffer> {
  if (!MEDIA_TYPES.includes(message.type as (typeof MEDIA_TYPES)[number])) {
    throw new Error(`Pesan bertipe "${message.type}" bukan media, tidak bisa di-download.`);
  }

  const buffer = await downloadMediaMessage(
    message.raw as WAMessage,
    'buffer',
    {},
    {
      logger: logger ?? defaultLogger,
      reuploadRequest: sock.updateMediaMessage,
    }
  );

  return buffer as Buffer;
}
