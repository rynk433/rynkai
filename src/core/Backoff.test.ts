import { describe, it, expect, vi, afterEach } from 'vitest';
import { Backoff } from './Backoff';

describe('Backoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('jeda naik secara exponential tiap percobaan', () => {
    // Matikan jitter biar hasil deterministik
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const backoff = new Backoff({ initialDelayMs: 1000, maxDelayMs: 60_000 });

    expect(backoff.next()).toBe(1000); // 1000 * 2^0
    expect(backoff.next()).toBe(2000); // 1000 * 2^1
    expect(backoff.next()).toBe(4000); // 1000 * 2^2
    expect(backoff.next()).toBe(8000); // 1000 * 2^3
  });

  it('tidak melebihi maxDelayMs walau attempt terus naik', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const backoff = new Backoff({ initialDelayMs: 1000, maxDelayMs: 5000 });

    for (let i = 0; i < 10; i++) backoff.next();

    expect(backoff.next()).toBe(5000);
  });

  it('menambahkan jitter sehingga hasil bisa sedikit lebih besar dari nilai dasar', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1); // jitter maksimum

    const backoff = new Backoff({ initialDelayMs: 1000, maxDelayMs: 60_000 });
    const delay = backoff.next();

    // base 1000 + jitter maksimum 30% = 1300
    expect(delay).toBe(1300);
  });

  it('canRetry() false setelah maxRetries tercapai', () => {
    const backoff = new Backoff({ maxRetries: 2 });

    expect(backoff.canRetry()).toBe(true);
    backoff.next();
    expect(backoff.canRetry()).toBe(true);
    backoff.next();
    expect(backoff.canRetry()).toBe(false);
  });

  it('canRetry() selalu true kalau maxRetries tidak diset', () => {
    const backoff = new Backoff();
    for (let i = 0; i < 100; i++) backoff.next();
    expect(backoff.canRetry()).toBe(true);
  });

  it('reset() mengembalikan attemptCount ke 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const backoff = new Backoff({ initialDelayMs: 1000 });
    backoff.next();
    backoff.next();
    expect(backoff.attemptCount).toBe(2);

    backoff.reset();
    expect(backoff.attemptCount).toBe(0);
    expect(backoff.next()).toBe(1000); // balik ke percobaan pertama
  });
});
