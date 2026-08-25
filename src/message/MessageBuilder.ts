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

  document(source: Buffer | { url: string }, fileName: string, mimetype = 'application/octet-stream'): AnyMessageContent {
    return { document: source, fileName, mimetype };
  },

  /**
   * Poll bawaan WhatsApp. `selectableCount` = 1 berarti single-choice,
   * lebih dari 1 berarti user boleh pilih banyak opsi.
   */
  poll(name: string, options: string[], selectableCount = 1): AnyMessageContent {
    return {
      poll: {
        name,
        values: options,
        selectableCount,
      },
    };
  },

  /**
   * Pesan dengan tombol quick-reply. Catatan: fitur ini pakai buttonsMessage
   * lama Baileys — beberapa versi WhatsApp client sudah membatasi/menyembunyikan
   * tombol non-template dari bisnis biasa. Tes dulu di device tujuan sebelum
   * diandalkan penuh; kalau tidak muncul, fallback ke MessageBuilder.text()
   * dengan opsi bernomor + baca via plugin command.
   */
  buttons(text: string, buttons: { id: string; text: string }[], footer?: string): AnyMessageContent {
    return {
      text,
      footer,
      buttons: buttons.map((b) => ({
        buttonId: b.id,
        buttonText: { displayText: b.text },
        type: 1,
      })),
      headerType: 1,
    } as AnyMessageContent;
  },

  /**
   * Pesan list (menu dropdown). Sama seperti buttons(), dukungannya
   * bervariasi antar versi WhatsApp — tes dulu sebelum diandalkan penuh.
   */
  list(
    text: string,
    buttonText: string,
    sections: { title: string; rows: { id: string; title: string; description?: string }[] }[],
    footer?: string
  ): AnyMessageContent {
    return {
      text,
      footer,
      buttonText,
      sections,
    } as AnyMessageContent;
  },
};
