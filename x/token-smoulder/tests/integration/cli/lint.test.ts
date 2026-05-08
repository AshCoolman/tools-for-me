import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeScaffoldEnv } from './helpers/scaffold-env.js';

const exec = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'token-smoulder');

type Issue = { rule: string; message: string };
type Report = { ok: boolean; name: string; issues: Issue[] };

async function runLint(env: NodeJS.ProcessEnv, name: string): Promise<{ exitCode: number; report: Report }> {
  try {
    const res = await exec(BIN, ['lint', name, '--json'], { env });
    return { exitCode: 0, report: JSON.parse(res.stdout) as Report };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { exitCode: err.code ?? -1, report: JSON.parse(err.stdout ?? '{}') as Report };
  }
}

async function fillExecutorForLintPass(dir: string): Promise<void> {
  const source = `import { executeAgentWork } from '../../src/core/runner.js';

export const executor = executeAgentWork(({ work }) => ({
  riskClass: 'readonly',
  objective: work.section('Objective'),
  context: work.section('Context'),
  constraints: work.section('Constraints'),
  promptFlow: ['/help'],
  stopConditions: ['fatal_error'],
}));
`;
  await writeFile(join(dir, 'executor.ts'), source, 'utf8');
}

describe('cli: lint', () => {
  it('fails on a freshly scaffolded unit with TODO + empty Done When issues', async () => {
    const { env } = await makeScaffoldEnv();

    await exec(BIN, ['new', 'fresh', 'one liner'], { env });

    const { exitCode, report } = await runLint(env, 'fresh');
    expect(exitCode).toBe(3);
    expect(report.ok).toBe(false);
    const rules = new Set(report.issues.map(i => i.rule));
    expect(rules.has('todo-sentinel')).toBe(true);
    expect(rules.has('done-when-empty')).toBe(true);
    expect(rules.has('prompt-flow-todo')).toBe(true);
  });

  it('passes once TODOs are replaced with a valid Done When and prompt flow', async () => {
    const { orchDir, env } = await makeScaffoldEnv();

    await exec(BIN, ['new', 'good', 'objective text'], { env });
    const dir = join(orchDir, 'good');

    const filledWork = `# Objective

objective text

# Context

Touches src/foo.ts and the \`yarn lint\` script.

# Constraints

- Do: read src/foo.ts.
- Don't: write outside the repo. (riskClass=readonly because no fs writes.)

# Done When

- file:src/foo.ts
- exit:yarn lint
- match:^OK$:specs/main/status.txt
`;
    await writeFile(join(dir, 'work.md'), filledWork, 'utf8');
    await fillExecutorForLintPass(dir);

    const { exitCode, report } = await runLint(env, 'good');
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
    expect(exitCode).toBe(0);
  });

  it('rejects malformed Done When rules', async () => {
    const { orchDir, env } = await makeScaffoldEnv();

    await exec(BIN, ['new', 'bad', 'x'], { env });
    const dir = join(orchDir, 'bad');

    const broken = `# Objective

x

# Context

c

# Constraints

c

# Done When

- looks good
- match:[unclosed:src/x.ts
`;
    await writeFile(join(dir, 'work.md'), broken, 'utf8');
    await fillExecutorForLintPass(dir);

    const { exitCode, report } = await runLint(env, 'bad');
    expect(exitCode).toBe(3);
    const grammarIssues = report.issues.filter(i => i.rule === 'done-when-grammar');
    expect(grammarIssues.length).toBeGreaterThanOrEqual(2);
  });

  it('returns exit 5 when the orchestration cannot be loaded', async () => {
    const { env } = await makeScaffoldEnv();

    let code = -1;
    try {
      await exec(BIN, ['lint', 'does-not-exist', '--json'], { env });
    } catch (e) {
      code = (e as { code?: number }).code ?? -1;
    }
    expect(code).toBe(5);
  });
});

