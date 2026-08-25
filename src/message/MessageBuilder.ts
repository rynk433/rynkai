import type { AnyMessageContent } from '@whiskeysockets/baileys';

/**
 * Kumpulan helper buat bikin payload pesan dengan cara yang lebih deklaratif
 * dibanding manual bikin object AnyMessageContent-nya Baileys.
 * Semua return AnyMessageContent, siap dilempar ke client.send(chatId, payload).
 */
export const MessageBuilder = {
  text(body: string): AnyMessageContent {
    return { text: body };
  },

  image(source: Buffer | { url: string }, caption?: string): AnyMessageContent {
    return { image: source, caption };
  },

  video(source: Buffer | { url: string }, caption?: string): AnyMessageContent {
    return { video: source, caption };
  },

  audio(source: Buffer | { url: string }, ptt = false): AnyMessageContent {
    return { audio: source, ptt, mimetype: 'audio/mp4' };
  },

  sticker(source: Buffer | { url: string }): AnyMessageContent {
    return { sticker: source };
  },

  document(source: Buffer | { url: string }, fileName: string, mimetype?: string): AnyMessageContent {
    return { document: source, fileName, mimetype };
  },
};
