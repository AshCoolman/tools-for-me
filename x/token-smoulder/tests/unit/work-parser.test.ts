import { describe, expect, it } from 'vitest';
import { parseWork, list } from '../../src/core/work-parser.js';
import { MissingSectionError } from '../../src/lib/errors.js';

const SAMPLE = `# Objective

Print "hello world" via the agent.

# Context

Quickstart smoke test.

# Constraints

- readonly
- no filesystem writes
`;

describe('parseWork', () => {
  it('extracts named sections', () => {
    const w = parseWork(SAMPLE);
    expect(w.section('Objective')).toContain('hello world');
    expect(w.section('Context')).toContain('Quickstart');
    expect(w.section('Constraints')).toContain('readonly');
  });

  it('preserves body text verbatim', () => {
    const w = parseWork(SAMPLE);
    expect(w.section('Constraints')).toBe('- readonly\n- no filesystem writes\n');
  });

  it('throws MissingSectionError for unknown section', () => {
    const w = parseWork(SAMPLE);
    expect(() => w.section('Nope')).toThrow(MissingSectionError);
  });

  it('handles a single section', () => {
    const w = parseWork('# One\n\nbody\n');
    expect(w.section('One')).toBe('body\n');
  });
});

describe('list', () => {
  it('parses numbered items into an array', () => {
    const section = '1. First step\n2. Second step\n3. Third step\n';
    expect(list(section)).toEqual(['First step', 'Second step', 'Third step']);
  });

  it('handles multi-line items', () => {
    const section = '1. Do the first thing\n   which spans two lines\n2. Do the second thing\n';
    expect(list(section)).toEqual([
      'Do the first thing which spans two lines',
      'Do the second thing',
    ]);
  });

  it('returns empty array for no numbered items', () => {
    expect(list('just some text\nno numbers here\n')).toEqual([]);
  });

  it('handles real prompt flow content', () => {
    const section = `1. Read 1-2 existing slash commands under .claude/commands/ to learn the shape.
2. Create the file .claude/commands/unblock-short.md with frontmatter.
3. Verify the result.
`;
    const result = list(section);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatch(/^Read 1-2/);
    expect(result[1]).toMatch(/^Create the file/);
    expect(result[2]).toMatch(/^Verify/);
  });
});
