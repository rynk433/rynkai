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

  it('parse pesan reaction dengan benar', () => {
    const raw = fakeRaw({
      message: {
        reactionMessage: {
          key: { id: 'TARGET_MSG_ID', remoteJid: '628123456789@s.whatsapp.net' },
          text: '🔥',
        },
      },
    });

    const result = parseMessage(raw);

    expect(result.type).toBe('reaction');
    expect(result.reaction).not.toBeNull();
    expect(result.reaction?.targetMessageId).toBe('TARGET_MSG_ID');
    expect(result.reaction?.emoji).toBe('🔥');
  });

  it('reaction bernilai null untuk pesan biasa', () => {
    const result = parseMessage(fakeRaw());
    expect(result.reaction).toBeNull();
  });

  it('parse pesan contact tunggal (contactMessage)', () => {
    const raw = fakeRaw({
      message: {
        contactMessage: {
          displayName: 'Budi',
          vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Budi\nEND:VCARD',
        },
      },
    });

    const result = parseMessage(raw);

    expect(result.type).toBe('contact');
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts?.[0].displayName).toBe('Budi');
    expect(result.contacts?.[0].vcard).toContain('FN:Budi');
  });

  it('parse pesan multi-contact (contactsArrayMessage)', () => {
    const raw = fakeRaw({
      message: {
        contactsArrayMessage: {
          contacts: [
            { displayName: 'Budi', vcard: 'BEGIN:VCARD\nFN:Budi\nEND:VCARD' },
            { displayName: 'Ani', vcard: 'BEGIN:VCARD\nFN:Ani\nEND:VCARD' },
          ],
        },
      },
    });

    const result = parseMessage(raw);

    expect(result.type).toBe('contact');
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts?.map((c) => c.displayName)).toEqual(['Budi', 'Ani']);
  });

  it('contacts bernilai null untuk pesan biasa', () => {
    const result = parseMessage(fakeRaw());
    expect(result.contacts).toBeNull();
  });

  it('parse pesan view-once (viewOnceMessage) dan buka tipe konten aslinya', () => {
    const raw = fakeRaw({
      message: {
        viewOnceMessage: {
          message: { imageMessage: { caption: 'foto rahasia' } },
        },
      },
    });

    const result = parseMessage(raw);

    expect(result.isViewOnce).toBe(true);
    expect(result.type).toBe('image');
    expect(result.text).toBe('foto rahasia');
  });

  it('parse pesan view-once varian V2 (viewOnceMessageV2)', () => {
    const raw = fakeRaw({
      message: {
        viewOnceMessageV2: {
          message: { videoMessage: { caption: 'video rahasia' } },
        },
      },
    });

    const result = parseMessage(raw);

    expect(result.isViewOnce).toBe(true);
    expect(result.type).toBe('video');
    expect(result.text).toBe('video rahasia');
  });

  it('isViewOnce bernilai false untuk pesan media biasa (bukan view-once)', () => {
    const raw = fakeRaw({ message: { imageMessage: { caption: 'foto biasa' } } });
    const result = parseMessage(raw);
    expect(result.isViewOnce).toBe(false);
  });
});
