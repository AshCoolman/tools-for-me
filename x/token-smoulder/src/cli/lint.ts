import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TODO_SENTINEL } from '../core/predicates/value.js';
import { findOrchestrationDir, loadOrchestration, type LoadedOrchestration } from './orchestration.js';

export type LintOptions = { json?: boolean };

export type LintIssue = {
  rule:
    | 'todo-sentinel'
    | 'section-empty'
    | 'done-when-grammar'
    | 'done-when-empty'
    | 'prompt-flow-empty'
    | 'prompt-flow-todo'
    | 'risk-class-missing';
  message: string;
  file?: string;
  line?: number;
};

export type LintReport = { ok: boolean; name: string; issues: LintIssue[] };

export type LintReportResult =
  | { kind: 'report'; report: LintReport }
  | { kind: 'boundary'; error: string };

const REQUIRED_SECTIONS = ['Objective', 'Context', 'Constraints', 'Done When'] as const;

export async function lintReport(name: string): Promise<LintReportResult> {
  const orchDir = await findOrchestrationDir();
  let orch: LoadedOrchestration;
  try {
    orch = await loadOrchestration(orchDir, name);
  } catch (e) {
    return { kind: 'boundary', error: e instanceof Error ? e.message : String(e) };
  }

  const issues: LintIssue[] = [];

  for (const f of ['work.md', 'policy.ts', 'executor.ts']) {
    const content = await readFile(join(orch.dir, f), 'utf8');
    const idx = content.indexOf(TODO_SENTINEL);
    if (idx >= 0) {
      const line = content.slice(0, idx).split('\n').length;
      issues.push({
        rule: 'todo-sentinel',
        file: f,
        line,
        message: `${f}:${line}: "${TODO_SENTINEL}" marker still present`,
      });
    }
  }

  for (const section of REQUIRED_SECTIONS) {
    let body: string;
    try {
      body = orch.work.section(section);
    } catch {
      issues.push({
        rule: 'section-empty',
        file: 'work.md',
        message: `work.md: missing required section "# ${section}"`,
      });
      continue;
    }
    if (stripCommentsAndBullets(body).trim().length === 0) {
      issues.push({
        rule: 'section-empty',
        file: 'work.md',
        message: `work.md: section "# ${section}" is empty`,
      });
    }
  }

  if (orch.work.sections.has('Done When')) {
    const body = orch.work.section('Done When');
    const rules = parseDoneWhen(body);
    if (rules.entries.length === 0) {
      issues.push({
        rule: 'done-when-empty',
        file: 'work.md',
        message: 'work.md: "# Done When" must contain at least one rule (file:, exit:, match:)',
      });
    }
    for (const issue of rules.issues) issues.push(issue);
  }

  if (!orch.plan.riskClass) {
    issues.push({
      rule: 'risk-class-missing',
      file: 'executor.ts',
      message: 'executor.ts: plan.riskClass is missing',
    });
  }

  const flow = orch.plan.promptFlow ?? [];
  if (flow.length === 0) {
    issues.push({
      rule: 'prompt-flow-empty',
      file: 'executor.ts',
      message: 'executor.ts: plan.promptFlow must contain at least one prompt',
    });
  }
  for (const [i, p] of flow.entries()) {
    if (typeof p === 'string' && p.includes(TODO_SENTINEL)) {
      issues.push({
        rule: 'prompt-flow-todo',
        file: 'executor.ts',
        message: `executor.ts: promptFlow[${i}] still contains "${TODO_SENTINEL}"`,
      });
    }
  }

  const ok = issues.length === 0;
  const report: LintReport = { ok, name, issues };
  return { kind: 'report', report };
}

export async function lintCommand(name: string, opts: LintOptions = {}): Promise<number> {
  const result = await lintReport(name);
  if (result.kind === 'boundary') {
    process.stderr.write(`lint: ${result.error}\n`);
    return 5;
  }
  const { report } = result;
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else if (report.ok) {
    process.stdout.write(`${name}: lint passed\n`);
  } else {
    process.stdout.write(
      `${name}: ${report.issues.length} issue${report.issues.length === 1 ? '' : 's'}\n`,
    );
    for (const i of report.issues) process.stdout.write(`  [${i.rule}] ${i.message}\n`);
  }
  return report.ok ? 0 : 3;
}

function stripCommentsAndBullets(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map(l => l.replace(/^\s*-\s*/, '').trim())
    .join('\n');
}

type DoneWhenParse = {
  entries: string[];
  issues: LintIssue[];
};

function parseDoneWhen(body: string): DoneWhenParse {
  const stripped = body.replace(/<!--[\s\S]*?-->/g, '');
  const lines = stripped.split('\n');
  const entries: string[] = [];
  const issues: LintIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const cleaned = raw.replace(/^\s*-\s*/, '').trim();
    if (cleaned.length === 0) continue;
    const result = validateDoneWhenRule(cleaned);
    if (result.ok) {
      entries.push(cleaned);
    } else {
      issues.push({
        rule: 'done-when-grammar',
        file: 'work.md',
        line: i + 1,
        message: `work.md "# Done When" line ${i + 1}: ${result.reason}`,
      });
    }
  }
  return { entries, issues };
}

function validateDoneWhenRule(line: string): { ok: true } | { ok: false; reason: string } {
  if (line.startsWith('file:')) {
    const rest = line.slice('file:'.length).trim();
    if (rest.length === 0) return { ok: false, reason: 'file: requires a path' };
    return { ok: true };
  }
  if (line.startsWith('exit:')) {
    const rest = line.slice('exit:'.length).trim();
    if (rest.length === 0) return { ok: false, reason: 'exit: requires a command' };
    return { ok: true };
  }
  if (line.startsWith('match:')) {
    const rest = line.slice('match:'.length);
    const sep = rest.lastIndexOf(':');
    if (sep < 0) {
      return { ok: false, reason: 'match: requires "<regex>:<source>"' };
    }
    const regex = rest.slice(0, sep);
    const source = rest.slice(sep + 1).trim();
    if (regex.length === 0) return { ok: false, reason: 'match: regex is empty' };
    if (source.length === 0) return { ok: false, reason: 'match: source is empty' };
    try {
      new RegExp(regex);
    } catch (e) {
      return {
        ok: false,
        reason: `match: regex did not compile (${e instanceof Error ? e.message : String(e)})`,
      };
    }
    return { ok: true };
  }
  return {
    ok: false,
    reason: 'unrecognised rule: expected "file:<path>", "exit:<cmd>", or "match:<regex>:<source>"',
  };
}
