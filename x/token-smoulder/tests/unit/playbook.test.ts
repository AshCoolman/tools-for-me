import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  matchError,
  loadPlaybook,
  savePlaybook,
  appendRule,
  parseInterpretResponse,
  type PlaybookRule,
} from '../../src/core/playbook.js';

function rule(overrides: Partial<PlaybookRule> & Pick<PlaybookRule, 'match'>): PlaybookRule {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 8),
    explanation: 'test explanation',
    remediation: 'test remediation',
    enabled: true,
    hits: 0,
    createdAt: '2026-05-12T00:00:00Z',
    source: 'manual',
    ...overrides,
  };
}

describe('matchError', () => {
  it('returns null for empty rules', () => {
    expect(matchError('some error', [])).toBeNull();
  });

  it('matches contains (case-insensitive)', () => {
    const r = rule({ match: { type: 'contains', value: 'unknown option' } });
    expect(matchError('error: unknown option --foo', [r])).toBe(r);
    expect(matchError('ERROR: UNKNOWN OPTION --bar', [r])).toBe(r);
  });

  it('matches regex', () => {
    const r = rule({ match: { type: 'regex', value: 'exit\\s+\\d+' } });
    expect(matchError('process exit 143', [r])).toBe(r);
    expect(matchError('process completed ok', [r])).toBeNull();
  });

  it('matches signature (normalized)', () => {
    const r = rule({ match: { type: 'signature', value: 'boundary error at <path>: exit <num>' } });
    expect(matchError('boundary error at /usr/bin/claude: exit 1234567', [r])).toBe(r);
    expect(matchError('boundary error at /other/path: exit 9999999', [r])).toBe(r);
    expect(matchError('different error entirely', [r])).toBeNull();
  });

  it('skips disabled rules', () => {
    const r = rule({ match: { type: 'contains', value: 'fail' }, enabled: false });
    expect(matchError('something failed', [r])).toBeNull();
  });

  it('first match wins within same type', () => {
    const r1 = rule({ id: 'first', match: { type: 'contains', value: 'error' }, explanation: 'first' });
    const r2 = rule({ id: 'second', match: { type: 'contains', value: 'error' }, explanation: 'second' });
    expect(matchError('an error occurred', [r1, r2])?.id).toBe('first');
  });

  it('signature matches before contains', () => {
    const sig = rule({ id: 'sig', match: { type: 'signature', value: 'boundary error at <path>: exit <num>' } });
    const con = rule({ id: 'con', match: { type: 'contains', value: 'boundary' } });
    const error = 'boundary error at /usr/bin/claude: exit 1234567';
    expect(matchError(error, [con, sig])?.id).toBe('sig');
  });

  it('contains matches before regex', () => {
    const con = rule({ id: 'con', match: { type: 'contains', value: 'timeout' } });
    const reg = rule({ id: 'reg', match: { type: 'regex', value: 'time.*out' } });
    expect(matchError('connection timeout', [reg, con])?.id).toBe('con');
  });

  it('malformed regex does not throw', () => {
    const bad = rule({ match: { type: 'regex', value: '[invalid(' } });
    expect(matchError('anything', [bad])).toBeNull();
  });
});

describe('loadPlaybook / savePlaybook', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'playbook-test-'));
  });

  it('returns empty array when file does not exist', async () => {
    expect(await loadPlaybook(dir)).toEqual([]);
  });

  it('round-trips rules', async () => {
    const rules = [
      rule({ id: 'a', match: { type: 'contains', value: 'foo' } }),
      rule({ id: 'b', match: { type: 'regex', value: 'bar\\d+' } }),
    ];
    await savePlaybook(dir, rules);
    const loaded = await loadPlaybook(dir);
    expect(loaded).toEqual(rules);
  });
});

describe('parseInterpretResponse', () => {
  it('parses valid response', () => {
    const text = 'EXPLANATION: The agent binary was not found.\nREMEDIATION: Install claude CLI or set TOKEN_SMOULDER_AGENT_BIN.';
    const result = parseInterpretResponse(text);
    expect(result).toEqual({
      explanation: 'The agent binary was not found.',
      remediation: 'Install claude CLI or set TOKEN_SMOULDER_AGENT_BIN.',
    });
  });

  it('returns null for garbage', () => {
    expect(parseInterpretResponse('some random text')).toBeNull();
  });

  it('handles extra whitespace and case', () => {
    const text = '  explanation:   spaces   \n  Remediation:   more spaces  ';
    const result = parseInterpretResponse(text);
    expect(result?.explanation).toBe('spaces');
    expect(result?.remediation).toBe('more spaces');
  });
});

describe('appendRule', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'playbook-test-'));
  });

  it('appends to empty playbook', async () => {
    const added = await appendRule(dir, {
      match: { type: 'contains', value: 'test' },
      explanation: 'test',
      remediation: 'fix it',
      enabled: true,
      source: 'manual',
    });
    expect(added.id).toBeTruthy();
    expect(added.hits).toBe(0);
    const loaded = await loadPlaybook(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.id).toBe(added.id);
  });

  it('appends to existing playbook', async () => {
    await savePlaybook(dir, [rule({ id: 'existing', match: { type: 'contains', value: 'a' } })]);
    await appendRule(dir, {
      match: { type: 'regex', value: 'b' },
      explanation: 'new',
      remediation: 'do something',
      enabled: true,
      source: 'claude',
    });
    const loaded = await loadPlaybook(dir);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.id).toBe('existing');
    expect(loaded[1]!.source).toBe('claude');
  });
});
