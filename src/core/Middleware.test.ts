import { describe, it, expect, vi } from 'vitest';
import { compose } from './Middleware';
import type { PluginContext } from '../types';

function fakeCtx(): PluginContext {
  return {} as PluginContext;
}

describe('compose (middleware onion model)', () => {
  it('menjalankan middleware sesuai urutan pendaftaran, lalu final handler', async () => {
    const order: string[] = [];

    const dispatch = compose(
      [
        async (_ctx, next) => {
          order.push('mw1-before');
          await next();
          order.push('mw1-after');
        },
        async (_ctx, next) => {
          order.push('mw2-before');
          await next();
          order.push('mw2-after');
        },
      ],
      async () => {
        order.push('final');
      }
    );

    await dispatch(fakeCtx());

    expect(order).toEqual(['mw1-before', 'mw2-before', 'final', 'mw2-after', 'mw1-after']);
  });

  it('final handler tidak jalan kalau middleware tidak memanggil next()', async () => {
    const final = vi.fn();

    const dispatch = compose(
      [
        async () => {
          // sengaja tidak panggil next()
        },
      ],
      final
    );

    await dispatch(fakeCtx());

    expect(final).not.toHaveBeenCalled();
  });

  it('jalan langsung ke final kalau tidak ada middleware', async () => {
    const final = vi.fn();
    const dispatch = compose([], final);

    await dispatch(fakeCtx());

    expect(final).toHaveBeenCalledOnce();
  });

  it('melempar error kalau next() dipanggil lebih dari sekali oleh middleware yang sama', async () => {
    const dispatch = compose(
      [
        async (_ctx, next) => {
          await next();
          await next(); // ini harus error
        },
      ],
      async () => {}
    );

    await expect(dispatch(fakeCtx())).rejects.toThrow('next() dipanggil lebih dari sekali');
  });

  it('error dari middleware/final ter-propagate ke pemanggil dispatch', async () => {
    const dispatch = compose([], async () => {
      throw new Error('gagal di final');
    });

    await expect(dispatch(fakeCtx())).rejects.toThrow('gagal di final');
  });
});
