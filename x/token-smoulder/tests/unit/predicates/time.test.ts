import { describe, expect, it } from 'vitest';
import { timeWindow } from '../../../src/core/predicates/time.js';
import type { Clock } from '../../../src/adapters/clock/interface.js';

const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) });

describe('timeWindow', () => {
  it('passes inside the window', async () => {
    const r = await timeWindow('19:00-23:30', fixedClock('2026-05-06T20:00:00Z'))();
    expect(r.ok).toBe(true);
  });

  it('fails outside the window', async () => {
    const r = await timeWindow('19:00-23:30', fixedClock('2026-05-06T10:00:00Z'))();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('19:00');
  });

  it('handles a window that crosses midnight', async () => {
    const before = await timeWindow('22:00-02:00', fixedClock('2026-05-06T23:00:00Z'))();
    const after = await timeWindow('22:00-02:00', fixedClock('2026-05-06T01:00:00Z'))();
    const outside = await timeWindow('22:00-02:00', fixedClock('2026-05-06T12:00:00Z'))();
    expect(before.ok).toBe(true);
    expect(after.ok).toBe(true);
    expect(outside.ok).toBe(false);
  });
});
