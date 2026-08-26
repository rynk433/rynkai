import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Test ini bukan nguji Client secara penuh (butuh koneksi WA asli),
 * tapi menguji prinsip yang jadi dasar fix di Client: Node.js EventEmitter
 * melempar error secara sinkron kalau event 'error' di-emit tanpa listener
 * sama sekali. Client HARUS selalu punya minimal satu listener 'error'
 * terpasang dari constructor-nya sendiri (lihat Client.ts) supaya emit('error', ...)
 * dari isolasi plugin/middleware tidak pernah men-crash proses consumer
 * yang lupa pasang bot.on('error', ...).
 */
describe('EventEmitter "error" semantics (dasar fix di Client)', () => {
  it('EventEmitter bawaan Node MELEMPAR error kalau tidak ada listener sama sekali', () => {
    const emitter = new EventEmitter();
    expect(() => emitter.emit('error', new Error('boom'))).toThrow('boom');
  });

  it('EventEmitter TIDAK melempar kalau sudah ada minimal satu listener error', () => {
    const emitter = new EventEmitter();
    let caught: unknown = null;
    emitter.on('error', (err) => {
      caught = err;
    });

    expect(() => emitter.emit('error', new Error('boom'))).not.toThrow();
    expect((caught as Error).message).toBe('boom');
  });
});
