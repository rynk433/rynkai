import { describe, it, expect } from 'vitest';
import { buildVCard, extractPhoneFromVCard } from './vcard';

describe('buildVCard', () => {
  it('membuat vcard valid dengan nama & nomor', () => {
    const vcard = buildVCard({ name: 'Budi', phone: '628123456789' });

    expect(vcard).toContain('BEGIN:VCARD');
    expect(vcard).toContain('VERSION:3.0');
    expect(vcard).toContain('FN:Budi');
    expect(vcard).toContain('waid=628123456789');
    expect(vcard).toContain('END:VCARD');
  });

  it('membersihkan format nomor (spasi, strip, tanda plus)', () => {
    const vcard = buildVCard({ name: 'Ani', phone: '+62 812-3456-789' });
    expect(vcard).toContain('waid=628123456789');
  });

  it('menyertakan organisasi kalau diisi', () => {
    const vcard = buildVCard({ name: 'Budi', phone: '628123456789', organization: 'PT Maju' });
    expect(vcard).toContain('ORG:PT Maju;');
  });

  it('tidak menyertakan baris ORG kalau organization tidak diisi', () => {
    const vcard = buildVCard({ name: 'Budi', phone: '628123456789' });
    expect(vcard).not.toContain('ORG:');
  });
});

describe('extractPhoneFromVCard', () => {
  it('mengambil nomor dari vcard yang dibuat buildVCard', () => {
    const vcard = buildVCard({ name: 'Budi', phone: '628123456789' });
    expect(extractPhoneFromVCard(vcard)).toBe('+628123456789');
  });

  it('return null kalau tidak ada field TEL', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Tanpa Nomor\nEND:VCARD';
    expect(extractPhoneFromVCard(vcard)).toBeNull();
  });
});
