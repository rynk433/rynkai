import type { proto } from '@whiskeysockets/baileys';
import type { NormalizedMessage, NormalizedMessageType } from '../types';

/**
 * Deteksi tipe pesan dari struktur proto Baileys yang aslinya
 * nested & berbeda-beda per jenis media. Kita ratain jadi satu enum simpel.
 */
function detectType(msg: proto.IMessage | null | undefined): NormalizedMessageType {
  if (!msg) return 'unknown';
  if (msg.conversation || msg.extendedTextMessage) return 'text';
  if (msg.imageMessage) return 'image';
  if (msg.videoMessage) return 'video';
  if (msg.audioMessage) return 'audio';
  if (msg.stickerMessage) return 'sticker';
  if (msg.documentMessage) return 'document';
  if (msg.locationMessage) return 'location';
  if (msg.contactMessage) return 'contact';
  if (msg.reactionMessage) return 'reaction';
  return 'unknown';
}

/** Ambil teks dari berbagai kemungkinan lokasi (conversation, caption, dst) */
function extractText(msg: proto.IMessage | null | undefined): string {
  if (!msg) return '';
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    ''
  );
}

function parseQuoted(msg: proto.IMessage | null | undefined): Omit<NormalizedMessage, 'quoted'> | null {
  const ctx = msg?.extendedTextMessage?.contextInfo;
  const quotedRaw = ctx?.quotedMessage;
  if (!quotedRaw || !ctx?.stanzaId) return null;

  return {
    id: ctx.stanzaId,
    sender: ctx.participant || '',
    chatId: ctx.participant || '',
    isGroup: false,
    type: detectType(quotedRaw),
    text: extractText(quotedRaw),
    fromMe: false,
    timestamp: 0,
    raw: { key: { id: ctx.stanzaId }, message: quotedRaw } as proto.IWebMessageInfo,
  };
}

/**
 * Ubah proto.IWebMessageInfo mentah dari Baileys jadi NormalizedMessage
 * yang lebih enak dipakai plugin/consumer library.
 */
export function parseMessage(raw: proto.IWebMessageInfo): NormalizedMessage {
  const chatId = raw.key.remoteJid || '';
  const isGroup = chatId.endsWith('@g.us');
  const sender = isGroup ? raw.key.participant || chatId : chatId;

  return {
    id: raw.key.id || '',
    sender,
    chatId,
    isGroup,
    type: detectType(raw.message),
    text: extractText(raw.message),
    fromMe: raw.key.fromMe || false,
    timestamp: Number(raw.messageTimestamp) || Math.floor(Date.now() / 1000),
    quoted: parseQuoted(raw.message),
    raw,
  };
}
