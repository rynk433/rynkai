import { describe, it, expect } from 'vitest';
import { parseMessage } from './MessageParser';
import type { proto } from '@whiskeysockets/baileys';

function fakeRaw(overrides: Partial<proto.IWebMessageInfo> = {}): proto.IWebMessageInfo {
  return {
    key: {
      id: 'MSG1',
      remoteJid: '628123456789@s.whatsapp.net',
      fromMe: false,
    },
    message: {
      conversation: 'halo bot',
    },
    messageTimestamp: 1700000000,
    ...overrides,
  } as proto.IWebMessageInfo;
}

describe('parseMessage', () => {
  it('parse pesan text biasa dari chat pribadi', () => {
    const result = parseMessage(fakeRaw());

    expect(result.id).toBe('MSG1');
    expect(result.chatId).toBe('628123456789@s.whatsapp.net');
    expect(result.sender).toBe('628123456789@s.whatsapp.net');
    expect(result.isGroup).toBe(false);
    expect(result.type).toBe('text');
    expect(result.text).toBe('halo bot');
    expect(result.fromMe).toBe(false);
    expect(result.quoted).toBeNull();
  });

  it('deteksi pesan dari grup dan ambil sender dari participant', () => {
    const raw = fakeRaw({
      key: {
        id: 'MSG2',
        remoteJid: '120363000000000000@g.us',
        participant: '628999999999@s.whatsapp.net',
        fromMe: false,
      },
    });

    const result = parseMessage(raw);

    expect(result.isGroup).toBe(true);
    expect(result.chatId).toBe('120363000000000000@g.us');
    expect(result.sender).toBe('628999999999@s.whatsapp.net');
  });

  it('ambil caption sebagai text untuk pesan image', () => {
    const raw = fakeRaw({
      message: { imageMessage: { caption: 'lihat ini' } },
    });

    const result = parseMessage(raw);

    expect(result.type).toBe('image');
    expect(result.text).toBe('lihat ini');
  });

  it('return type unknown kalau tidak ada field message yang dikenali', () => {
    const raw = fakeRaw({ message: {} });
    const result = parseMessage(raw);
    expect(result.type).toBe('unknown');
    expect(result.text).toBe('');
  });

  it('parse pesan reply/quoted dengan benar', () => {
    const raw = fakeRaw({
      message: {
        extendedTextMessage: {
          text: 'balasanku',
          contextInfo: {
            stanzaId: 'ORIGINAL1',
            participant: '628111111111@s.whatsapp.net',
            quotedMessage: { conversation: 'pesan asli' },
          },
        },
      },
    });

    const result = parseMessage(raw);

    expect(result.text).toBe('balasanku');
    expect(result.quoted).not.toBeNull();
    expect(result.quoted?.id).toBe('ORIGINAL1');
    expect(result.quoted?.text).toBe('pesan asli');
  });

  it('fallback ke timestamp sekarang kalau messageTimestamp kosong', () => {
    const raw = fakeRaw({ messageTimestamp: undefined });
    const before = Math.floor(Date.now() / 1000);
    const result = parseMessage(raw);
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
  });
});
