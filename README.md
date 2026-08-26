# rynkai

![CI](https://github.com/rynk433/rynkai/actions/workflows/ci.yml/badge.svg)

Wrapper TypeScript yang clean di atas [Baileys](https://github.com/WhiskeySockets/Baileys), lengkap dengan plugin system & session store yang bisa diganti-ganti sesuai kebutuhan.

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

## Blocklist / whitelist user & grup

```ts
import { AccessControl } from 'rynkai';

// Mode blocklist (default): bot terbuka untuk semua, kecuali yang di-block
const acl = new AccessControl({ replyMessage: 'Kamu diblokir dari bot ini.' });
acl.block('628123456789@s.whatsapp.net');
acl.unblock('628123456789@s.whatsapp.net');

bot.use(acl.middleware());
```

```ts
// Mode whitelist: bot privat, cuma JID tertentu yang boleh pakai
const acl = new AccessControl({ mode: 'whitelist' });
acl.allow('628123456789@s.whatsapp.net'); // izinkan user tertentu
acl.allow('120363000000000000@g.us');     // izinkan grup tertentu

bot.use(acl.middleware());
```

Satu instance `AccessControl` bisa dipakai buat user maupun grup sekaligus (dibedakan dari suffix JID-nya). Middleware ini mengecek **sender DAN chatId grup** — kalau salah satu diblokir, command tidak diteruskan ke plugin.

## Reconnect backoff & graceful shutdown

Kalau koneksi putus (bukan karena logout), rynkai otomatis reconnect dengan **exponential backoff** (jeda 1 detik → 2 → 4 → ... sampai maksimal 30 detik, plus sedikit jitter acak) — bukan reconnect instan yang bisa bikin WA curiga.

```ts
const bot = new Client({
  sessionName: 'my-bot',
  reconnect: {
    initialDelayMs: 1000,   // jeda awal
    maxDelayMs: 30_000,     // jeda maksimum
    maxRetries: 10,         // opsional, default tidak terbatas
  },
});

bot.on('reconnecting', ({ attempt, delayMs }) => {
  console.log(`Reconnect percobaan ke-${attempt}, tunggu ${delayMs}ms...`);
});

bot.on('reconnect-failed', () => {
  console.log('Menyerah reconnect, cek koneksi internet/server.');
});
```

Buat graceful shutdown (misal saat proses mau dimatikan), pakai `disconnect()` — beda dari `logout()`, ini **tidak menghapus sesi tersimpan**, jadi bisa `connect()` lagi tanpa scan QR ulang:

```ts
process.on('SIGINT', async () => {
  await bot.disconnect();
  process.exit(0);
});
```

## Reactions & read receipt

```ts
bot.on('message', async (msg) => {
  await bot.react(msg, '👍');       // kasih reaction ke pesan masuk
  await bot.removeReaction(msg);    // hapus reaction (kirim emoji kosong)
  await bot.markAsRead(msg);        // tandai sudah dibaca (centang biru)
});

// Deteksi kalau seseorang react ke pesan (termasuk pesan bot sendiri)
bot.on('message', (msg) => {
  if (msg.type === 'reaction' && msg.reaction) {
    console.log(`${msg.sender} react ${msg.reaction.emoji} ke pesan ${msg.reaction.targetMessageId}`);
  }
});
```

Auto-mark semua pesan masuk sebagai sudah dibaca:

```ts
const bot = new Client({
  sessionName: 'my-bot',
  autoRead: true,
});
```

## Presence (typing / online status)

```ts
await bot.sendTyping(msg.chatId);              // "sedang mengetik..." selama 1 detik
await bot.sendTyping(msg.chatId, 3000);         // custom durasi
await bot.sendPresence(msg.chatId, 'available'); // online / unavailable / recording / dst
```

## Group helpers

```ts
const info = await bot.getGroupMetadata(groupId);
console.log(info.subject, info.participants.length);

await bot.addParticipants(groupId, ['628123456789@s.whatsapp.net']);
await bot.removeParticipants(groupId, ['628123456789@s.whatsapp.net']);
await bot.promoteParticipants(groupId, ['628123456789@s.whatsapp.net']);
await bot.demoteParticipants(groupId, ['628123456789@s.whatsapp.net']);

bot.on('group-participants-update', ({ groupId, action, participants }) => {
  // action: 'add' | 'remove' | 'promote' | 'demote'
  if (action === 'add') {
    console.log(`${participants.join(', ')} join ke grup ${groupId}`);
  }
});
```

## Interactive messages (button, list, poll)

```ts
import { MessageBuilder } from 'rynkai';

// Poll
await bot.send(chatId, MessageBuilder.poll('Makan apa nanti?', ['Nasi goreng', 'Mie ayam', 'Sate'], 1));

// Buttons
await bot.send(
  chatId,
  MessageBuilder.buttons(
    'Pilih menu:',
    [
      { id: 'menu_profile', text: 'Profil' },
      { id: 'menu_shop', text: 'Shop' },
    ],
    'Bot Footer'
  )
);

// List
await bot.send(
  chatId,
  MessageBuilder.list('Pilih kategori:', 'Buka Menu', [
    {
      title: 'Kategori Utama',
      rows: [
        { id: 'cat_weapon', title: 'Senjata', description: 'Lihat semua senjata' },
        { id: 'cat_armor', title: 'Armor', description: 'Lihat semua armor' },
      ],
    },
  ])
);
```

> Catatan: dukungan `buttons()` dan `list()` bervariasi antar versi WhatsApp client — beberapa versi terbaru membatasi tombol non-template dari akun biasa. Tes dulu di device tujuan sebelum diandalkan penuh di production; `poll()` jauh lebih stabil karena native feature WhatsApp.

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

## Session store custom

Default-nya pakai `FileSessionStore` (simpan sesi sebagai file di disk). Kalau butuh store lain (MongoDB, Redis, dll), tinggal implement interface `SessionStore`:

```ts
import type { SessionStore } from 'rynkai';

class MySessionStore implements SessionStore {
  async load() { /* ... */ }
  async save(state) { /* ... */ }
  async clear() { /* ... */ }
}

const bot = new Client({
  sessionName: 'my-bot',
  sessionStore: new MySessionStore(),
});
```

## Pairing code (tanpa QR)

```ts
const bot = new Client({
  sessionName: 'my-bot',
  pairingCode: { phoneNumber: '628123456789' },
});

bot.on('pairingCode', (code) => console.log('Kode pairing:', code));
```

## Error handling

Kalau ada plugin/middleware yang throw error, rynkai **tidak akan crash** — errornya diisolasi per-pesan, jadi pesan lain tetap diproses normal. Ini berlaku otomatis walau kamu tidak pasang listener `error` sama sekali (rynkai selalu punya listener default internal, jadi aman dari perilaku khusus Node.js `EventEmitter` yang biasanya crash kalau event `'error'` di-emit tanpa listener).

```ts
bot.on('error', (err, { source, message }) => {
  console.error(`Error dari ${source}:`, err);
  // kirim ke Sentry/logging eksternal di sini kalau perlu
});
```

## Hal yang perlu diperhatikan sebelum produksi

rynkai membungkus Baileys dan menambah fitur di atasnya, tapi ada beberapa hal di luar kendali library ini yang tetap perlu kamu pertimbangkan sendiri:

- **Baileys itu unofficial API** — bukan API resmi Meta/WhatsApp. Risiko akun kena banned/flag selalu ada terlepas library apapun yang dipakai di atasnya, terutama kalau kirim pesan masif/spam ke banyak nomor asing.
- **`FileSessionStore` menyimpan kredensial sesi sebagai file JSON polos di disk**, tidak dienkripsi. Kalau server/device kamu diakses orang lain, sesi WA bisa dicuri. Untuk deployment produksi, pastikan folder `.rynkai-sessions/` dijaga (permission file, tidak masuk backup publik, dst), atau implement `SessionStore` custom yang enkripsi datanya.
- **Plugin loader pakai `require()` dinamis** — kalau folder plugin bisa diisi orang lain (misal upload file dari user tanpa validasi), itu sama saja dengan remote code execution. Jangan expose folder plugin ke input yang tidak terpercaya.
- **Belum ada integration test** terhadap koneksi WhatsApp asli (test suite yang ada murni unit test logic internal seperti parser/plugin loader/rate limiter) — karena butuh akun WA aktif buat testing end-to-end.

Ini normal untuk semua project di atas Baileys, bukan hal yang bisa "diselesaikan" library — tapi penting untuk disadari sebelum menganggap sesuatu "aman" secara menyeluruh.

## Testing

```bash
npm test          # run sekali
npm run test:watch # mode watch
```

Test coverage saat ini: `MessageParser`, `PluginLoader` (termasuk cooldown), `RateLimiter`, `Middleware` (compose/onion), `SendQueue`.

## Status

Masih tahap awal (0.1.0). Yang sudah ada:
- [x] Core client (connect, reconnect, QR/pairing code)
- [x] Normalized message parsing (text, media, quoted)
- [x] Plugin loader + cooldown
- [x] FileSessionStore default
- [x] MessageBuilder helper
- [x] Middleware/hooks sebelum plugin dieksekusi
- [x] Rate limiter global (terpisah dari cooldown per-plugin)
- [x] Media downloader helper (`client.downloadMedia()`)
- [x] Message send queue dengan throttle (anti rate-limit WA)
- [x] Presence helper (`sendTyping`, `sendPresence`)
- [x] Group helpers (metadata, add/remove/promote/demote, join-leave event)
- [x] Interactive messages (button, list, poll)
- [x] Test suite (MessageParser, PluginLoader, RateLimiter, Middleware, SendQueue)
- [x] GitHub Actions CI (auto build+test tiap push/PR, matrix Node 20 & 22)
- [x] Message reactions (`react`, `removeReaction`) & read receipt (`markAsRead`, `autoRead`)
- [x] Graceful shutdown (`disconnect()`) + reconnect exponential backoff dengan jitter
- [x] Blocklist/whitelist user & grup built-in (`AccessControl`)

Belum ada (rencana selanjutnya):
- [x] ~~CLI scaffold (`npx create-rynkai-bot`)~~ — sudah tersedia sebagai package terpisah
