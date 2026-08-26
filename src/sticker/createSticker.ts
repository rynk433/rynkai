import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

export interface StickerOptions {
  /** Nama sticker pack, muncul saat orang add sticker ke koleksinya. */
  packname?: string;
  /** Nama author/publisher sticker pack. */
  author?: string;
  /** Kualitas webp 0-100, default 80. Cuma berlaku untuk sticker gambar (bukan animasi). */
  quality?: number;
}

// node-webpmux tidak selalu menyediakan type declaration resmi yang akurat,
// jadi kita definisikan sendiri bagian minimal yang kita pakai di sini,
// bukan mengandalkan `typeof import('node-webpmux')`.
interface WebpmuxImage {
  load(buffer: Buffer): Promise<void>;
  exif: Buffer;
  save(path: null): Promise<Buffer>;
}
interface WebpmuxModule {
  Image: new () => WebpmuxImage;
}

function loadSharp(): typeof import('sharp') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('sharp');
  } catch {
    throw new Error(
      '[rynkai] createSticker butuh package "sharp" tapi belum terinstall. Jalankan: npm install sharp'
    );
  }
}

function loadWebpmux(): WebpmuxModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node-webpmux');
  } catch {
    throw new Error(
      '[rynkai] Metadata sticker (packname/author) butuh package "node-webpmux" tapi belum terinstall. ' +
        'Jalankan: npm install node-webpmux (atau panggil tanpa packname/author untuk skip ini).'
    );
  }
}

/** Suntik metadata sticker pack (nama & author) ke buffer webp lewat EXIF chunk. */
async function addStickerMetadata(webpBuffer: Buffer, packname: string, author: string): Promise<Buffer> {
  const { Image } = loadWebpmux();
  const img = new Image();
  await img.load(webpBuffer);

  const payload = {
    'sticker-pack-id': `rynkai-${Date.now()}`,
    'sticker-pack-name': packname,
    'sticker-pack-publisher': author,
    emojis: ['😀'],
  };

  // Header EXIF TIFF standar yang dipakai WhatsApp buat baca metadata sticker.
  // Ini format yang sama dipakai library sticker WA populer lainnya.
  const exifHeader = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16,
    0x00, 0x00, 0x00,
  ]);
  const jsonBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const exif = Buffer.concat([exifHeader, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);

  img.exif = exif;
  return img.save(null);
}

/**
 * Ubah buffer gambar (jpg/png/dst) jadi WhatsApp sticker statis (webp).
 * Butuh package "sharp" terinstall (`npm install sharp`), dan "node-webpmux"
 * kalau mau isi packname/author (`npm install node-webpmux`).
 *
 * ```ts
 * const buffer = await bot.downloadMedia(msg);
 * const sticker = await createSticker(buffer, { packname: 'Bot Aku', author: 'rynk' });
 * await bot.send(msg.chatId, MessageBuilder.sticker(sticker));
 * ```
 */
export async function createSticker(imageBuffer: Buffer, options: StickerOptions = {}): Promise<Buffer> {
  const sharp = loadSharp();

  const webpBuffer = await sharp(imageBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: options.quality ?? 80 })
    .toBuffer();

  if (!options.packname && !options.author) {
    return webpBuffer;
  }

  return addStickerMetadata(webpBuffer, options.packname ?? '', options.author ?? '');
}

/**
 * Ubah buffer video/gif jadi WhatsApp sticker animasi (webp animasi).
 *
 * **Butuh `ffmpeg` terinstall di sistem dan ada di PATH** — ini bukan
 * package npm, tapi program eksternal. Di server Linux biasanya:
 * `apt install ffmpeg` (Debian/Ubuntu) atau `pkg install ffmpeg` (Termux).
 * Batas durasi otomatis dipotong 6 detik pertama (batas wajar sticker WA).
 */
export async function createAnimatedSticker(videoBuffer: Buffer, options: StickerOptions = {}): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `rynkai-in-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  const outputPath = path.join(tmpDir, `rynkai-out-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`);

  await fs.writeFile(inputPath, videoBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-vcodec',
        'libwebp',
        '-vf',
        "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0",
        '-loop',
        '0',
        '-ss',
        '00:00:00',
        '-t',
        '00:00:06',
        '-an',
        '-vsync',
        '0',
        outputPath,
      ]);

      ffmpeg.on('error', (err) => {
        reject(
          new Error(
            `[rynkai] Gagal menjalankan ffmpeg. Pastikan ffmpeg terinstall dan ada di PATH. (${err.message})`
          )
        );
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`[rynkai] ffmpeg keluar dengan kode ${code} saat membuat sticker animasi.`));
      });
    });

    const outputBuffer = await fs.readFile(outputPath);

    if (!options.packname && !options.author) {
      return outputBuffer;
    }

    return await addStickerMetadata(outputBuffer, options.packname ?? '', options.author ?? '');
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}
