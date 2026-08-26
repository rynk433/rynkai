import { describe, it, expect } from 'vitest';
import { createSticker } from './createSticker';

// sharp adalah native binding (butuh libvips terkompilasi) — di beberapa
// platform seperti Termux/Android ARM64, binary prebuilt-nya sering tidak
// tersedia. Daripada bikin seluruh test suite gagal karena satu dependency
// opsional yang tidak kompatibel, kita skip test ini dengan baik dan kasih
// tau lewat console kalau sharp memang tidak bisa dimuat di environment ini.
let sharp: typeof import('sharp') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sharp = require('sharp');
} catch {
  console.warn(
    '\n[rynkai] Melewati test createSticker: package "sharp" tidak bisa dimuat di environment ini ' +
      '(umum terjadi di Termux/Android ARM64 tanpa libvips). Fitur sticker tetap akan berfungsi normal ' +
      'di platform yang didukung sharp (Linux x64/arm64 server, macOS, Windows, GitHub Actions, dll).\n'
  );
}

function isWebp(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

describe.skipIf(!sharp)('createSticker', () => {
  it('mengubah buffer gambar jadi webp valid', async () => {
    const input = await sharp!({
      create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const result = await createSticker(input);

    expect(isWebp(result)).toBe(true);
  });

  it('hasil selalu 512x512 terlepas dari ukuran/rasio gambar asli', async () => {
    const input = await sharp!({
      create: { width: 300, height: 150, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const result = await createSticker(input);
    const metadata = await sharp!(result).metadata();

    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });

  it('menyisipkan packname & author ke metadata kalau diisi', async () => {
    const input = await sharp!({
      create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const result = await createSticker(input, { packname: 'Pack Ujian', author: 'Penguji' });

    expect(isWebp(result)).toBe(true);
    // Metadata disimpan sebagai JSON di EXIF chunk, jadi teksnya harus
    // ketemu di suatu tempat dalam buffer hasil.
    expect(result.includes('Pack Ujian')).toBe(true);
    expect(result.includes('Penguji')).toBe(true);
  });

  it('tidak menyisipkan metadata kalau packname & author kosong', async () => {
    const input = await sharp!({
      create: { width: 100, height: 100, channels: 4, background: { r: 100, g: 100, b: 100, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const withoutMeta = await createSticker(input);
    const withMeta = await createSticker(input, { packname: 'X' });

    // Versi dengan metadata harus lebih besar (nambah EXIF chunk)
    expect(withMeta.length).toBeGreaterThan(withoutMeta.length);
  });
});
