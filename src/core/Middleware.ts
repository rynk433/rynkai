import type { PluginContext } from '../types';

export type NextFunction = () => Promise<void>;

/**
 * Middleware bergaya "onion" (kayak Koa/Express): tiap middleware bisa
 * ngerjain sesuatu sebelum & sesudah next() dipanggil, atau berhenti
 * total dengan tidak memanggil next() sama sekali (misal buat blokir user).
 *
 * Contoh logging:
 * client.use(async (ctx, next) => {
 *   console.log(`-> ${ctx.message.sender} pakai command`);
 *   await next();
 *   console.log(`<- selesai`);
 * });
 *
 * Contoh blokir user tanpa lanjut ke plugin:
 * client.use(async (ctx, next) => {
 *   if (isBanned(ctx.message.sender)) return; // next() tidak dipanggil
 *   await next();
 * });
 */
export type Middleware = (ctx: PluginContext, next: NextFunction) => Promise<void> | void;

/**
 * Susun array middleware + handler akhir jadi satu fungsi dispatch.
 * Implementasi standar "onion model" seperti koa-compose.
 */
export function compose(middlewares: Middleware[], final: NextFunction): (ctx: PluginContext) => Promise<void> {
  return async function dispatch(ctx: PluginContext): Promise<void> {
    let lastIndex = -1;

    async function invoke(i: number): Promise<void> {
      if (i <= lastIndex) {
        throw new Error('next() dipanggil lebih dari sekali oleh middleware yang sama');
      }
      lastIndex = i;

      if (i === middlewares.length) {
        await final();
        return;
      }

      const mw = middlewares[i];
      await mw(ctx, () => invoke(i + 1));
    }

    await invoke(0);
  };
}
