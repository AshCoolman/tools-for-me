import { describe, expect, it } from 'vitest';
import { parseWork } from '../../src/core/work-parser.js';
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
