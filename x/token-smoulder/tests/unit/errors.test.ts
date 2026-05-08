import { describe, expect, it } from 'vitest';
import { BoundaryError, asBoundaryError, MissingSectionError, TimeoutError } from '../../src/lib/errors.js';

describe('BoundaryError', () => {
  it('preserves endpoint, args, code, and original message', () => {
    const err = new BoundaryError({
      endpoint: 'claude-token-simple',
      args: { argv: ['--quota'] },
      code: 127,
      original: 'command not found',
    });
    expect(err.endpoint).toBe('claude-token-simple');
    expect(err.args).toEqual({ argv: ['--quota'] });
    expect(err.code).toBe(127);
    expect(err.original).toBe('command not found');
    expect(err.message).toContain('claude-token-simple');
    expect(err.message).toContain('127');
    expect(err.message).toContain('command not found');
  });

  it('produces stable JSON via toJSON', () => {
    const err = new BoundaryError({
      endpoint: 'agent',
      args: { sessionId: 'abc' },
      code: 1,
      original: 'broken',
    });
    const a = JSON.stringify(err);
    const b = JSON.stringify(err);
    expect(a).toBe(b);
    expect(JSON.parse(a)).toMatchObject({
      name: 'BoundaryError',
      endpoint: 'agent',
      code: 1,
      original: 'broken',
    });
  });
});

describe('asBoundaryError', () => {
  it('wraps an Error original', () => {
    const inner = new Error('boom');
    const err = asBoundaryError('quota', { x: 1 }, 1, inner);
    expect(err.original).toBe('boom');
  });

  it('wraps a string original', () => {
    const err = asBoundaryError('quota', {}, 'EACCES', 'permission denied');
    expect(err.original).toBe('permission denied');
  });
});

describe('MissingSectionError', () => {
  it('exposes the section name', () => {
    const err = new MissingSectionError('Objective');
    expect(err.section).toBe('Objective');
    expect(err.message).toContain('Objective');
  });
});

describe('TimeoutError', () => {
  it('exposes endpoint and timeoutMs', () => {
    const err = new TimeoutError('human-input', 1000);
    expect(err.endpoint).toBe('human-input');
    expect(err.timeoutMs).toBe(1000);
  });
});
