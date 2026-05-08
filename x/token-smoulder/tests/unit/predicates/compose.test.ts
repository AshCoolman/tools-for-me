import { describe, expect, it, vi } from 'vitest';
import { and, or } from '../../../src/core/predicates/compose.js';
import type { Predicate } from '../../../src/core/types.js';

const ok = (reason: string): Predicate => async () => ({ ok: true, reason });
const no = (reason: string): Predicate => async () => ({ ok: false, reason });

describe('and', () => {
  it('returns ok when all pass', async () => {
    const r = await and([ok('a'), ok('b')])();
    expect(r.ok).toBe(true);
  });

  it('short-circuits on first false', async () => {
    const second = vi.fn(ok('b'));
    const r = await and([no('a'), second])();
    expect(r.ok).toBe(false);
    expect(second).not.toHaveBeenCalled();
    expect(r.reason).toContain('a');
  });

  it('surfaces failing reasons', async () => {
    const r = await and([no('quota')])();
    expect(r.reason).toContain('quota');
  });
});

describe('or', () => {
  it('returns ok on first true', async () => {
    const second = vi.fn(no('b'));
    const r = await or([ok('a'), second])();
    expect(r.ok).toBe(true);
    expect(second).not.toHaveBeenCalled();
  });

  it('returns false when all fail and includes reasons', async () => {
    const r = await or([no('a'), no('b')])();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('a');
    expect(r.reason).toContain('b');
  });
});
