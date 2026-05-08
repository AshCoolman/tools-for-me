import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { findOrchestrationDir } from './orchestration.js';
import { templatesDir } from './new.js';
import { inferName, inferRiskClass } from './infer.js';
import { lintReport, type LintReport } from './lint.js';
import { checkDecision } from './check.js';
import type { DispatchDecision, RiskClass } from '../core/types.js';

export type AddOptions = { json?: boolean; section?: string };

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const TEMPLATE_FILES = ['work.md', 'policy.ts', 'executor.ts'] as const;

export type AddVerdict = {
  name: string;
  oneLiner: string | null;
  scaffolded: boolean;
  inferred: { riskClass: RiskClass; signal: string } | null;
  policy: { allowlist: RiskClass[] };
  lint: LintReport | { boundary: string };
  check: DispatchDecision | { boundary: string } | { skipped: 'lint-boundary' };
  next: string;
};

export type AddResult =
  | { kind: 'verdict'; verdict: AddVerdict }
  | { kind: 'input-error'; message: string }
  | { kind: 'not-found'; name: string };

export async function addInner(arg: string, opts: { section?: string } = {}): Promise<AddResult> {
  const trimmed = arg.trim();
  if (trimmed.length === 0) return { kind: 'input-error', message: 'argument must be a non-empty idea or unit name' };
  if (/[\r\n]/.test(trimmed)) return { kind: 'input-error', message: 'argument must be a single line (no newlines)' };

  const orchDir = await findOrchestrationDir();
  const looksLikeName = NAME_RE.test(trimmed) && !trimmed.includes(' ');
  const existsAsName =
    looksLikeName && (await stat(join(orchDir, trimmed)).then(() => true).catch(() => false));

  let name: string;
  let oneLiner: string | null = null;
  let scaffolded = false;
  let inferred: { riskClass: RiskClass; signal: string } | null = null;
  let allowlist: RiskClass[] = ['readonly'];

  if (existsAsName) {
    name = trimmed;
    allowlist = await readPolicyAllowlist(join(orchDir, name, 'policy.ts'));
  } else if (looksLikeName) {
    return { kind: 'not-found', name: trimmed };
  } else {
    oneLiner = trimmed;
    const taken = await listExistingUnits(orchDir);
    name = inferName(oneLiner, taken);
    const risk = inferRiskClass(oneLiner);
    inferred = { riskClass: risk.riskClass, signal: risk.signal };
    allowlist = risk.riskClass === 'readonly' ? ['readonly'] : ['readonly', risk.riskClass];
    await scaffoldUnit(orchDir, name, oneLiner, risk.riskClass, allowlist);
    scaffolded = true;
  }

  const lintResult = await lintReport(name);
  const lintField: AddVerdict['lint'] =
    lintResult.kind === 'boundary'
      ? { boundary: lintResult.error }
      : lintResult.report;

  let checkField: AddVerdict['check'];
  if (lintResult.kind === 'boundary') {
    checkField = { skipped: 'lint-boundary' };
  } else {
    const checkResult = await checkDecision(name, opts);
    checkField =
      checkResult.kind === 'boundary'
        ? { boundary: checkResult.error }
        : checkResult.decision;
  }

  const next = recommendNext({
    name,
    scaffolded,
    lint: lintField,
    check: checkField,
  });

  return {
    kind: 'verdict',
    verdict: { name, oneLiner, scaffolded, inferred, policy: { allowlist }, lint: lintField, check: checkField, next },
  };
}

export async function addCommand(arg: string, opts: AddOptions = {}): Promise<number> {
  const result = await addInner(arg, opts);
  if (result.kind === 'input-error') {
    process.stderr.write(`add: ${result.message}\n`);
    return 2;
  }
  if (result.kind === 'not-found') {
    process.stderr.write(
      `add: no orchestration named '${result.name}'. Pass an idea string instead, e.g.:\n  token-smoulder add "<one-line idea>"\n`,
    );
    return 4;
  }
  const { verdict } = result;
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(verdict)}\n`);
  } else {
    printVerdict(verdict);
  }
  return exitCodeFor(verdict);
}

async function listExistingUnits(orchDir: string): Promise<Set<string>> {
  try {
    const entries = await readdir(orchDir, { withFileTypes: true });
    return new Set(entries.filter(e => e.isDirectory()).map(e => e.name));
  } catch {
    return new Set();
  }
}

async function scaffoldUnit(
  orchDir: string,
  name: string,
  oneLiner: string,
  riskClass: RiskClass,
  allowlist: RiskClass[],
): Promise<void> {
  const targetDir = join(orchDir, name);
  await mkdir(targetDir, { recursive: true });
  const tplDir = templatesDir();
  for (const f of TEMPLATE_FILES) {
    let content = await readFile(join(tplDir, f), 'utf8');
    content = content
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{oneLiner\}\}/g, oneLiner);
    if (f === 'executor.ts' && riskClass !== 'readonly') {
      content = content.replace(/riskClass:\s*['"]readonly['"]/, `riskClass: '${riskClass}'`);
    }
    if (f === 'policy.ts' && allowlist.length > 1) {
      const list = allowlist.map(r => `'${r}'`).join(', ');
      content = content.replace(
        /safeRiskClass\(\[\s*['"]readonly['"]\s*\]/,
        `safeRiskClass([${list}]`,
      );
    }
    await writeFile(join(targetDir, f), content, 'utf8');
  }
}

async function readPolicyAllowlist(policyPath: string): Promise<RiskClass[]> {
  try {
    const src = await readFile(policyPath, 'utf8');
    const m = src.match(/safeRiskClass\(\s*\[([^\]]+)\]/);
    if (!m || !m[1]) return ['readonly'];
    const items = m[1]
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(s => s.length > 0);
    return items as RiskClass[];
  } catch {
    return ['readonly'];
  }
}

function recommendNext(args: {
  name: string;
  scaffolded: boolean;
  lint: AddVerdict['lint'];
  check: AddVerdict['check'];
}): string {
  const { name, lint, check } = args;

  if ('boundary' in lint) {
    return `lint could not load orchestration/${name}/ — ${lint.boundary}`;
  }
  if (!lint.ok) {
    const ruleSet = new Set(lint.issues.map(i => i.rule));
    if (ruleSet.has('todo-sentinel') || ruleSet.has('section-empty')) {
      return `edit orchestration/${name}/work.md to fill the unfilled sections, then re-run: token-smoulder add ${name}`;
    }
    if (ruleSet.has('done-when-empty') || ruleSet.has('done-when-grammar')) {
      return `rewrite "# Done When" in orchestration/${name}/work.md using file:/exit:/match: grammar, then re-run: token-smoulder add ${name}`;
    }
    if (ruleSet.has('prompt-flow-todo') || ruleSet.has('prompt-flow-empty')) {
      return `replace promptFlow placeholders in orchestration/${name}/executor.ts with concrete prompts, then re-run: token-smoulder add ${name}`;
    }
    return `fix the lint issues above, then re-run: token-smoulder add ${name}`;
  }

  if ('boundary' in check) {
    return `check failed at boundary: ${check.boundary}`;
  }
  if ('skipped' in check) {
    return `check skipped: lint did not produce a usable report`;
  }
  if (check.shouldRun) {
    return `ready · run now: token-smoulder run ${name} --once · or let the daemon dispatch in the next quiet window`;
  }

  const failed = check.failedReasons.join(' · ');
  if (/boundary error/.test(failed)) {
    return `quota source unreachable. Quick fix: set TOKEN_SMOULDER_QUOTA_SOURCE=fake-pass in .env. Real fix: install a working quota source (see src/adapters/quota/)`;
  }
  if (/safeRiskClass/.test(failed) && /not in allowlist/.test(failed)) {
    const m = failed.match(/safeRiskClass:\s*(\S+)\s+not in allowlist/);
    const cls = m?.[1] ?? 'declared class';
    if (cls === 'networked' || cls === 'low-risk-write') {
      return `riskClass=${cls} is outside the dispatcher's v1 floor [readonly, repo-local]. Restrict the work to readonly/repo-local, or widen DEFAULT_ALLOWED in src/cli/check.ts if you've thought through the safety`;
    }
    return `policy.ts allowlist doesn't include the executor's riskClass. Edit orchestration/${name}/policy.ts and re-run: token-smoulder add ${name}`;
  }
  if (/enoughQuota/.test(failed) && /below threshold/.test(failed)) {
    return `quota too low right now — wait for next reset, or shrink the unit's scope`;
  }
  if (/noExternalActiveSessionsFor/.test(failed)) {
    return `external claude/cursor sessions detected — close them or wait for them to idle out`;
  }
  return `check returned shouldRun=false (${failed || 'no specific reason surfaced'})`;
}

function exitCodeFor(v: AddVerdict): number {
  if ('boundary' in v.lint) return 5;
  if (!v.lint.ok) return 3;
  if ('boundary' in v.check) return 5;
  if ('skipped' in v.check) return 5;
  if (!v.check.shouldRun) return 3;
  return 0;
}

function printVerdict(v: AddVerdict): void {
  const out = process.stdout;
  out.write(`unit:        ${v.name}\n`);
  if (v.oneLiner) out.write(`idea:        ${truncate(v.oneLiner, 80)}\n`);
  if (v.inferred) {
    out.write(`riskClass:   ${v.inferred.riskClass}  (${v.inferred.signal})\n`);
    if (v.inferred.riskClass !== 'readonly' && v.inferred.riskClass !== 'repo-local') {
      out.write(
        `             ⚠ ${v.inferred.riskClass} is outside the dispatcher v1 floor [readonly, repo-local]; this unit will not dispatch as-is\n`,
      );
    }
  }
  out.write(`policy:      safeRiskClass([${v.policy.allowlist.join(', ')}])`);
  if (v.scaffolded && v.policy.allowlist.length > 1) out.write(`  (auto-aligned)`);
  out.write(`\n\n`);

  if ('boundary' in v.lint) {
    out.write(`lint:        boundary error\n             ${v.lint.boundary}\n\n`);
  } else if (v.lint.ok) {
    out.write(`lint:        clean\n\n`);
  } else {
    out.write(`lint:        ${v.lint.issues.length} issue${v.lint.issues.length === 1 ? '' : 's'}\n`);
    for (const i of v.lint.issues) out.write(`             [${i.rule}] ${i.message}\n`);
    out.write(`\n`);
  }

  if ('skipped' in v.check) {
    out.write(`check:       skipped\n\n`);
  } else if ('boundary' in v.check) {
    out.write(`check:       boundary error\n             ${v.check.boundary}\n\n`);
  } else {
    out.write(`check:       shouldRun=${v.check.shouldRun}\n`);
    for (const r of v.check.reasons) out.write(`             pass: ${r}\n`);
    for (const r of v.check.failedReasons) out.write(`             fail: ${r}\n`);
    out.write(`\n`);
  }

  out.write(`next:        ${v.next}\n`);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
