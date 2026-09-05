export interface VCardOptions {
  /** Nama yang ditampilkan untuk kontak ini. */
  name: string;
  /** Nomor telepon, boleh pakai "+" atau spasi/strip — otomatis dibersihkan. Contoh: "+62 812-3456-789". */
  phone: string;
  /** Nama organisasi/perusahaan, opsional. */
  organization?: string;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

/**
 * Bikin string VCARD 3.0 yang dikenali WhatsApp (termasuk field "waid" yang
 * bikin kontak bisa langsung di-chat tanpa nomor tersimpan sebelumnya).
 */
export function buildVCard(options: VCardOptions): string {
  const digits = normalizePhone(options.phone);
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${options.name}`, `N:;${options.name};;;`];

  if (options.organization) {
    lines.push(`ORG:${options.organization};`);
  }

  lines.push(`TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}`);
  lines.push('END:VCARD');

  return lines.join('\n');
}

/**
 * Ambil nomor telepon dari string vcard (misal dari kontak yang di-share
 * orang lain ke bot). Return null kalau tidak ketemu field TEL.
 */
export function extractPhoneFromVCard(vcard: string): string | null {
  const match = vcard.match(/^TEL[^:]*:(.+)$/m);
  if (!match) return null;
  return match[1].trim();
}
