import { describe, it, expect, vi } from 'vitest';
import { AccessControl } from './AccessControl';
import type { PluginContext, NormalizedMessage } from '../types';

function fakeCtx(sender: string, chatId = sender): PluginContext {
  return {
    client: {} as PluginContext['client'],
    message: { sender, chatId } as NormalizedMessage,
    args: [],
    reply: vi.fn(async () => {}),
  };
}

describe('AccessControl', () => {
  describe('mode blocklist (default)', () => {
    it('mengizinkan semua JID secara default', () => {
      const acl = new AccessControl();
      expect(acl.isAllowed('siapa-saja@s.whatsapp.net')).toBe(true);
    });

    it('memblokir JID yang di-block()', () => {
      const acl = new AccessControl();
      acl.block('spammer@s.whatsapp.net');

      expect(acl.isAllowed('spammer@s.whatsapp.net')).toBe(false);
      expect(acl.isAllowed('orang-lain@s.whatsapp.net')).toBe(true);
    });

    it('unblock() mengembalikan akses', () => {
      const acl = new AccessControl();
      acl.block('user@s.whatsapp.net');
      acl.unblock('user@s.whatsapp.net');

      expect(acl.isAllowed('user@s.whatsapp.net')).toBe(true);
    });
  });

  describe('mode whitelist', () => {
    it('memblokir semua JID secara default', () => {
      const acl = new AccessControl({ mode: 'whitelist' });
      expect(acl.isAllowed('siapa-saja@s.whatsapp.net')).toBe(false);
    });

    it('mengizinkan JID yang di-allow()', () => {
      const acl = new AccessControl({ mode: 'whitelist' });
      acl.allow('owner@s.whatsapp.net');

      expect(acl.isAllowed('owner@s.whatsapp.net')).toBe(true);
      expect(acl.isAllowed('orang-lain@s.whatsapp.net')).toBe(false);
    });

    it('disallow() mencabut izin', () => {
      const acl = new AccessControl({ mode: 'whitelist' });
      acl.allow('user@s.whatsapp.net');
      acl.disallow('user@s.whatsapp.net');

      expect(acl.isAllowed('user@s.whatsapp.net')).toBe(false);
    });
  });

  describe('list() & has()', () => {
    it('list() mengembalikan semua entry', () => {
      const acl = new AccessControl({ initial: ['a@s.whatsapp.net', 'b@s.whatsapp.net'] });
      expect(acl.list().sort()).toEqual(['a@s.whatsapp.net', 'b@s.whatsapp.net']);
    });

    it('has() mengecek keberadaan di list terlepas dari mode', () => {
      const acl = new AccessControl({ mode: 'whitelist', initial: ['a@s.whatsapp.net'] });
      expect(acl.has('a@s.whatsapp.net')).toBe(true);
      expect(acl.has('b@s.whatsapp.net')).toBe(false);
    });
  });

  describe('middleware()', () => {
    it('meneruskan ke next() kalau sender & chatId diizinkan', async () => {
      const acl = new AccessControl();
      const next = vi.fn(async () => {});
      const mw = acl.middleware();

      await mw(fakeCtx('user@s.whatsapp.net'), next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('tidak memanggil next() kalau sender diblokir', async () => {
      const acl = new AccessControl();
      acl.block('spammer@s.whatsapp.net');
      const next = vi.fn(async () => {});
      const mw = acl.middleware();

      await mw(fakeCtx('spammer@s.whatsapp.net'), next);

      expect(next).not.toHaveBeenCalled();
    });

    it('mengirim replyMessage kalau diblokir dan replyMessage diset', async () => {
      const acl = new AccessControl({ replyMessage: 'Diblokir!' });
      acl.block('spammer@s.whatsapp.net');
      const ctx = fakeCtx('spammer@s.whatsapp.net');

      await acl.middleware()(ctx, vi.fn());

      expect(ctx.reply).toHaveBeenCalledWith('Diblokir!');
    });

    it('tidak reply sama sekali kalau replyMessage tidak diset (silent)', async () => {
      const acl = new AccessControl();
      acl.block('spammer@s.whatsapp.net');
      const ctx = fakeCtx('spammer@s.whatsapp.net');

      await acl.middleware()(ctx, vi.fn());

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('memblokir kalau chatId (grup) diblokir walau sender diizinkan', async () => {
      const acl = new AccessControl();
      acl.block('120363000000000000@g.us');
      const next = vi.fn(async () => {});

      await acl.middleware()(fakeCtx('user-biasa@s.whatsapp.net', '120363000000000000@g.us'), next);

      expect(next).not.toHaveBeenCalled();
    });
  });
});
