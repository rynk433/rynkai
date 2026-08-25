# rynkai

Wrapper TypeScript yang clean di atas [Baileys](https://github.com/WhiskeySockets/Baileys), lengkap dengan plugin system & session store yang bisa diganti-ganti (file, MongoDB, dll).

## Install

```bash
npm install rynkai
```

## Quickstart

```ts
import { Client, MessageBuilder } from 'rynkai';

const bot = new Client({
  sessionName: 'my-bot',
  prefix: '.',
});

bot.on('qr', (qr) => {
  // render qr pakai qrcode-terminal atau library lain
  console.log('Scan QR ini:', qr);
});

bot.on('ready', () => {
  console.log('Bot connected!');
});

bot.on('message', async (msg) => {
  if (msg.text === 'ping') {
    await bot.reply(msg, 'pong');
  }
});

await bot.connect();
```

## Plugin system

Plugin format-nya sengaja mirip gaya rynk4: `{ name, command, category, execute() }`.

```ts
// plugins/hello.ts
import type { Plugin } from 'rynkai';

const plugin: Plugin = {
  name: 'hello',
  command: ['hello', 'hi'],
  category: 'general',
  cooldown: 5, // detik, opsional
  execute: async (ctx) => {
    await ctx.reply(`Halo, ${ctx.message.sender}!`);
  },
};

export default plugin;
```

```ts
await bot.plugins.loadFromDirectory('./plugins');
await bot.connect();
```

## Download media

```ts
bot.on('message', async (msg) => {
  if (msg.type === 'image') {
    const buffer = await bot.downloadMedia(msg);
    // buffer siap disimpan ke disk, di-forward, diproses, dll
  }
});
```

## Message send queue (anti rate-limit)

Semua `client.send()` dan `client.reply()` otomatis lewat antrian dengan jeda default 250ms antar pesan — mencegah akun ke-flag WA saat kirim banyak pesan beruntun (misal broadcast). Bisa disesuaikan:

```ts
const bot = new Client({
  sessionName: 'my-bot',
  sendQueue: { intervalMs: 500 }, // lebih santai, jeda 500ms
});
```

## Middleware / hooks

Middleware jalan sebelum plugin, bergaya "onion" (kayak Koa/Express) — bisa ngerjain sesuatu sebelum & sesudah `next()`, atau berhenti total tanpa memanggil `next()` (misal buat blokir user).

```ts
bot.use(async (ctx, next) => {
  console.log(`[${ctx.message.sender}] -> ${ctx.message.text}`);
  await next();
  console.log(`[${ctx.message.sender}] <- selesai`);
});

bot.use(async (ctx, next) => {
  if (isBanned(ctx.message.sender)) {
    await ctx.reply('Kamu diblokir dari bot ini.');
    return; // next() tidak dipanggil, plugin tidak jalan
  }
  await next();
});
```

Middleware dijalankan berurutan sesuai urutan `use()` dipanggil, dan berlaku untuk semua command (beda dari `cooldown` di plugin yang per-command).

## Rate limiter global

Beda dari `cooldown` (per-plugin, per-user), `rateLimit` di config berlaku global — total command apapun yang boleh dijalankan satu user dalam satu window waktu.

```ts
const bot = new Client({
  sessionName: 'my-bot',
  rateLimit: { max: 10, windowMs: 60_000 }, // maksimal 10 command per menit per user
});
```

Kalau user kelebihan limit, bot otomatis reply pemberitahuan dan command tidak diteruskan ke middleware/plugin.

## Session store custom (misal MongoDB)

Sudah disediakan `MongoSessionStore` built-in — cocok kalau stack-mu (kayak rynk4) sudah pakai MongoDB/Mongoose:

```bash
npm install mongoose
```

```ts
import mongoose from 'mongoose';
import { Client, MongoSessionStore } from 'rynkai';

await mongoose.connect(process.env.MONGO_URI!); // buka koneksi dulu sebelum connect()

const bot = new Client({
  sessionName: 'my-bot',
  sessionStore: new MongoSessionStore('my-bot'),
});
```

Kalau butuh store lain (Redis, dll), tinggal implement interface `SessionStore` yang sama:

```ts
import type { SessionStore } from 'rynkai';

class RedisSessionStore implements SessionStore {
  async load() { /* ... */ }
  async save(state) { /* ... */ }
  async clear() { /* ... */ }
}
```

## Pairing code (tanpa QR)

```ts
const bot = new Client({
  sessionName: 'my-bot',
  pairingCode: { phoneNumber: '628123456789' },
});

bot.on('pairingCode', (code) => console.log('Kode pairing:', code));
```

## Status

Masih tahap awal (0.1.0). Yang sudah ada:
- [x] Core client (connect, reconnect, QR/pairing code)
- [x] Normalized message parsing (text, media, quoted)
- [x] Plugin loader + cooldown
- [x] FileSessionStore default
- [x] MessageBuilder helper
- [x] Middleware/hooks sebelum plugin dieksekusi
- [x] Rate limiter global (terpisah dari cooldown per-plugin)
- [x] Built-in MongoSessionStore
- [x] Media downloader helper (`client.downloadMedia()`)
- [x] Message send queue dengan throttle (anti rate-limit WA)

Belum ada (rencana selanjutnya):
- [ ] Test suite
- [ ] Interactive messages (button, list, poll)
- [ ] Presence helper (typing, online status)
- [ ] Group helpers (metadata, add/remove participant, join/leave event)
