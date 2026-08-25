import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginLoader } from './PluginLoader';
import type { Plugin, PluginContext, NormalizedMessage } from '../types';

function fakeContext(sender = 'user1@s.whatsapp.net'): PluginContext {
  return {
    client: {} as PluginContext['client'],
    message: { sender } as NormalizedMessage,
    args: [],
    reply: vi.fn(async () => {}),
  };
}

describe('PluginLoader', () => {
  let loader: PluginLoader;

  beforeEach(() => {
    loader = new PluginLoader();
  });

  it('register & find plugin berdasarkan command', () => {
    const plugin: Plugin = { name: 'ping', command: 'ping', execute: vi.fn() };
    loader.register(plugin);

    expect(loader.find('ping')).toBe(plugin);
    expect(loader.find('PING')).toBe(plugin); // case-insensitive
    expect(loader.find('tidak-ada')).toBeUndefined();
  });

  it('register plugin dengan multiple command alias', () => {
    const plugin: Plugin = { name: 'hello', command: ['hello', 'hi'], execute: vi.fn() };
    loader.register(plugin);

    expect(loader.find('hello')).toBe(plugin);
    expect(loader.find('hi')).toBe(plugin);
  });

  it('execute menjalankan plugin yang cocok dan return true', async () => {
    const execute = vi.fn();
    loader.register({ name: 'ping', command: 'ping', execute });

    const ctx = fakeContext();
    const handled = await loader.execute('ping', ctx);

    expect(handled).toBe(true);
    expect(execute).toHaveBeenCalledWith(ctx);
  });

  it('execute return false kalau tidak ada plugin yang cocok', async () => {
    const ctx = fakeContext();
    const handled = await loader.execute('tidak-ada', ctx);
    expect(handled).toBe(false);
  });

  it('list() tidak duplikat walau plugin punya banyak alias command', () => {
    loader.register({ name: 'hello', command: ['hello', 'hi', 'hey'], execute: vi.fn() });
    expect(loader.list()).toHaveLength(1);
  });

  describe('cooldown', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('blokir eksekusi kedua dalam window cooldown & kasih tau sisa waktu', async () => {
      const execute = vi.fn();
      loader.register({ name: 'heal', command: 'heal', cooldown: 10, execute });

      const ctx = fakeContext('userA');
      await loader.execute('heal', ctx); // panggilan pertama, lolos
      await loader.execute('heal', ctx); // panggilan kedua, kena cooldown

      expect(execute).toHaveBeenCalledTimes(1);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Tunggu'));
    });

    it('boleh eksekusi lagi setelah cooldown habis', async () => {
      const execute = vi.fn();
      loader.register({ name: 'heal', command: 'heal', cooldown: 10, execute });

      const ctx = fakeContext('userA');
      await loader.execute('heal', ctx);

      vi.advanceTimersByTime(10_001);

      await loader.execute('heal', ctx);
      expect(execute).toHaveBeenCalledTimes(2);
    });

    it('cooldown per-user, tidak saling mempengaruhi antar user berbeda', async () => {
      const execute = vi.fn();
      loader.register({ name: 'heal', command: 'heal', cooldown: 10, execute });

      await loader.execute('heal', fakeContext('userA'));
      await loader.execute('heal', fakeContext('userB'));

      expect(execute).toHaveBeenCalledTimes(2);
    });
  });
});
