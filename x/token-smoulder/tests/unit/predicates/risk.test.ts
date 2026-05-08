import { describe, expect, it } from 'vitest';
import { safeRiskClass } from '../../../src/core/predicates/risk.js';
import type { RiskClass } from '../../../src/core/types.js';

describe('safeRiskClass', () => {
  it('allows declared classes', async () => {
    const r = await safeRiskClass(['readonly', 'repo-local'], 'readonly')();
    expect(r.ok).toBe(true);
  });

  it('blocks destructive unconditionally even if listed', async () => {
    const r = await safeRiskClass(['readonly', 'destructive' as RiskClass], 'destructive')();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/destructive/);
  });

  it('blocks privileged unconditionally even if listed', async () => {
    const r = await safeRiskClass(['privileged' as RiskClass], 'privileged')();
    expect(r.ok).toBe(false);
  });

  it('blocks unknown class (treated as destructive)', async () => {
    const r = await safeRiskClass(['readonly'], 'unknown-thing' as unknown as RiskClass)();
    expect(r.ok).toBe(false);
  });

  it('blocks a class not in the allowlist', async () => {
    const r = await safeRiskClass(['readonly'], 'low-risk-write')();
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/low-risk-write/);
  });
});
