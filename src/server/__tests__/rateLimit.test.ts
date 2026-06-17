import { describe, it, expect, beforeEach } from 'vitest';
import { createRateLimiter } from '../rateLimit.js';

describe('createRateLimiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  });

  it('allows requests under the cap', () => {
    expect(limiter.check('1.1.1.1')).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.check('1.1.1.1')).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.check('1.1.1.1')).toEqual({ allowed: true, remaining: 0 });
  });

  it('blocks the request that exceeds the cap', () => {
    limiter.check('1.1.1.1');
    limiter.check('1.1.1.1');
    limiter.check('1.1.1.1');
    expect(limiter.check('1.1.1.1')).toEqual({ allowed: false, remaining: 0 });
  });

  it('tracks separate IPs independently', () => {
    limiter.check('1.1.1.1');
    limiter.check('1.1.1.1');
    limiter.check('1.1.1.1');
    expect(limiter.check('1.1.1.1').allowed).toBe(false);
    expect(limiter.check('2.2.2.2').allowed).toBe(true);
  });

  it('expires entries after windowMs', () => {
    const fakeNow = { value: 1_000_000 };
    const l = createRateLimiter({ windowMs: 60_000, max: 1, now: () => fakeNow.value });
    expect(l.check('x').allowed).toBe(true);
    expect(l.check('x').allowed).toBe(false);
    fakeNow.value += 60_001;
    expect(l.check('x').allowed).toBe(true);
  });
});
