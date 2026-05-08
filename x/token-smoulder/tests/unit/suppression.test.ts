import { describe, expect, it } from 'vitest';
import { deriveSuppressionKey } from '../../src/core/suppression.js';
import { hashContent } from '../../src/lib/hashing.js';

const HASH = (s: string) => hashContent(s);

const baseInput = () => ({
  orchestrationName: 'demo',
  workHash: HASH('w'),
  policyHash: HASH('p'),
  executorHash: HASH('e'),
  failingPromptIndex: 0,
  failureSignature: 'sig',
});

describe('deriveSuppressionKey', () => {
  it('is deterministic for identical inputs', () => {
    const a = deriveSuppressionKey(baseInput());
    const b = deriveSuppressionKey(baseInput());
    expect(a).toBe(b);
  });

  it('differs when orchestrationName changes', () => {
    expect(deriveSuppressionKey(baseInput())).not.toBe(
      deriveSuppressionKey({ ...baseInput(), orchestrationName: 'other' }),
    );
  });

  it('differs when workHash changes', () => {
    expect(deriveSuppressionKey(baseInput())).not.toBe(
      deriveSuppressionKey({ ...baseInput(), workHash: HASH('w2') }),
    );
  });

  it('differs when policyHash changes', () => {
    expect(deriveSuppressionKey(baseInput())).not.toBe(
      deriveSuppressionKey({ ...baseInput(), policyHash: HASH('p2') }),
    );
  });

  it('differs when executorHash changes', () => {
    expect(deriveSuppressionKey(baseInput())).not.toBe(
      deriveSuppressionKey({ ...baseInput(), executorHash: HASH('e2') }),
    );
  });

  it('differs when failingPromptIndex changes', () => {
    expect(deriveSuppressionKey(baseInput())).not.toBe(
      deriveSuppressionKey({ ...baseInput(), failingPromptIndex: 1 }),
    );
  });

  it('differs when failureSignature changes', () => {
    expect(deriveSuppressionKey(baseInput())).not.toBe(
      deriveSuppressionKey({ ...baseInput(), failureSignature: 'sig2' }),
    );
  });

  it('produces a 64-hex-char SHA-256 string', () => {
    expect(deriveSuppressionKey(baseInput())).toMatch(/^[0-9a-f]{64}$/);
  });
});
