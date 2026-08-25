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

## Session store custom (misal MongoDB)

```ts
import type { SessionStore } from 'rynkai';

class MongoSessionStore implements SessionStore {
  async load() { /* ... */ }
  async save(state) { /* ... */ }
  async clear() { /* ... */ }
}

const bot = new Client({
  sessionName: 'my-bot',
  sessionStore: new MongoSessionStore(),
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

## Status

Masih tahap awal (0.1.0). Yang sudah ada:
- [x] Core client (connect, reconnect, QR/pairing code)
- [x] Normalized message parsing (text, media, quoted)
- [x] Plugin loader + cooldown
- [x] FileSessionStore default
- [x] MessageBuilder helper

Belum ada (rencana selanjutnya):
- [ ] Built-in MongoSessionStore
- [ ] Middleware/hooks sebelum plugin dieksekusi
- [ ] Rate limiter global (bukan cuma per-plugin)
- [ ] Test suite
