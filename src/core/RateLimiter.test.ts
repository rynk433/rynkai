import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './RateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mengizinkan request selama masih di bawah max', () => {
    const limiter = new RateLimiter({ max: 3, windowMs: 60_000 });
    const user = 'userA';

    expect(limiter.consume(user)).toBe(true);
    expect(limiter.consume(user)).toBe(true);
    expect(limiter.consume(user)).toBe(true);
  });

  it('menolak request setelah melebihi max dalam satu window', () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 60_000 });
    const user = 'userA';

    limiter.consume(user);
    limiter.consume(user);

    expect(limiter.consume(user)).toBe(false);
  });

  it('reset otomatis setelah window berakhir', () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 });
    const user = 'userA';

    expect(limiter.consume(user)).toBe(true);
    expect(limiter.consume(user)).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(limiter.consume(user)).toBe(true);
  });

  it('tidak saling mempengaruhi antar user berbeda', () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 60_000 });

    expect(limiter.consume('userA')).toBe(true);
    expect(limiter.consume('userB')).toBe(true);
    expect(limiter.consume('userA')).toBe(false);
    expect(limiter.consume('userB')).toBe(false);
  });

  it('retryAfter mengembalikan 0 kalau user belum pernah request', () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 60_000 });
    expect(limiter.retryAfter('userBaru')).toBe(0);
  });

  it('retryAfter mengembalikan sisa detik yang mendekati window', () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 10_000 });
    limiter.consume('userA');

    vi.advanceTimersByTime(4000);

    expect(limiter.retryAfter('userA')).toBe(6);
  });
});
