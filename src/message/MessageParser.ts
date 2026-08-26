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
  if (msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3) return 'poll';
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
    reaction: null,
    raw: { key: { id: ctx.stanzaId }, message: quotedRaw } as proto.IWebMessageInfo,
  };
}

/** Ambil target message id & emoji dari sebuah reactionMessage */
function parseReaction(msg: proto.IMessage | null | undefined): NormalizedMessage['reaction'] {
  const reactionMsg = msg?.reactionMessage;
  if (!reactionMsg?.key?.id) return null;

  return {
    targetMessageId: reactionMsg.key.id,
    emoji: reactionMsg.text || '',
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
    reaction: parseReaction(raw.message),
    raw,
  };
}
