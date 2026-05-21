import { Command } from 'commander';
import kleur from 'kleur';
import { existsSync } from 'node:fs';
import { copyTemplate } from '../utils/copy-template.js';
import type { TemplateEntry, FileResult } from '../utils/copy-template.js';

export interface InitOptions {
  dryRun: boolean;
  force: boolean;
  target: string;
  claudeCommands: boolean;
  skill: boolean;
  scripts: boolean;
  docs: boolean;
  all: boolean;
}

const COMMANDS_SET: TemplateEntry[] = [
  { sourcePath: 'claude/commands/cslice.intent.md', targetPath: '.claude/commands/cslice.intent.md' },
  { sourcePath: 'claude/commands/cslice.contract.md', targetPath: '.claude/commands/cslice.contract.md' },
  { sourcePath: 'claude/commands/cslice.review.md', targetPath: '.claude/commands/cslice.review.md' },
  { sourcePath: 'claude/commands/cslice.tests.md', targetPath: '.claude/commands/cslice.tests.md' },
  { sourcePath: 'claude/commands/cslice.implement.md', targetPath: '.claude/commands/cslice.implement.md' },
  { sourcePath: 'claude/commands/cslice.verify.md', targetPath: '.claude/commands/cslice.verify.md' },
];

const SCRIPTS_SET: TemplateEntry[] = [
  { sourcePath: 'scripts/cslice-verify.sh', targetPath: 'scripts/cslice-verify.sh', executable: true },
];

const DOCS_SET: TemplateEntry[] = [
  { sourcePath: 'docs/contract-slice.md', targetPath: '.dev/contract-slice/contract-slice.md' },
  { sourcePath: 'docs/theory.md', targetPath: '.dev/contract-slice/theory.md' },
  { sourcePath: 'docs/intent-template.md', targetPath: '.dev/contract-slice/intent-template.md' },
  { sourcePath: 'docs/contract-template.md', targetPath: '.dev/contract-slice/contract-template.md' },
];

const SKILL_SET: TemplateEntry[] = [
  { sourcePath: 'skills/contract-slice/SKILL.md', targetPath: '.claude/skills/contract-slice/SKILL.md' },
  { sourcePath: 'skills/contract-slice/references/theory.md', targetPath: '.claude/skills/contract-slice/references/theory.md' },
  { sourcePath: 'skills/contract-slice/references/typescript-contracts.md', targetPath: '.claude/skills/contract-slice/references/typescript-contracts.md' },
  { sourcePath: 'skills/contract-slice/references/runtime-schemas.md', targetPath: '.claude/skills/contract-slice/references/runtime-schemas.md' },
  { sourcePath: 'skills/contract-slice/references/property-tests.md', targetPath: '.claude/skills/contract-slice/references/property-tests.md' },
  { sourcePath: 'skills/contract-slice/references/failure-modes.md', targetPath: '.claude/skills/contract-slice/references/failure-modes.md' },
  { sourcePath: 'skills/contract-slice/references/hard-gates.md', targetPath: '.claude/skills/contract-slice/references/hard-gates.md' },
];

function selectEntries(opts: InitOptions): TemplateEntry[] {
  if (opts.all) {
    return [...COMMANDS_SET, ...SCRIPTS_SET, ...DOCS_SET, ...SKILL_SET];
  }

  const entries: TemplateEntry[] = [];
  const defaultInstall = !opts.claudeCommands && !opts.scripts;

  if (defaultInstall || opts.claudeCommands) entries.push(...COMMANDS_SET);
  if (defaultInstall) entries.push(...SCRIPTS_SET, ...DOCS_SET);
  if (opts.scripts && !defaultInstall) entries.push(...SCRIPTS_SET);
  if (opts.skill) entries.push(...SKILL_SET);

  return entries;
}

function formatAction(action: string): string {
  const padded = action.padEnd(9);
  if (action === 'CREATE') return kleur.green(padded);
  if (action === 'OVERWRITE') return kleur.yellow(padded);
  return kleur.dim(padded);
}

export async function runInit(opts: InitOptions, templatesRoot: string): Promise<FileResult[]> {
  if (!existsSync(opts.target)) {
    process.stderr.write(`error: target directory does not exist: ${opts.target}\n`);
    process.exit(1);
  }

  const entries = selectEntries(opts);
  const results = await copyTemplate(entries, {
    templatesRoot,
    target: opts.target,
    dryRun: opts.dryRun,
    force: opts.force,
  });

  for (const r of results) {
    process.stdout.write(`${formatAction(r.action)} ${r.path}\n`);
  }

  return results;
}

export function buildInitCommand(program: Command, templatesRoot: string): void {
  program
    .command('init')
    .description('Install Contract Slice workflow assets into the target directory')
    .option('--dry-run', 'Report actions without writing files', false)
    .option('--force', 'Overwrite existing files', false)
    .option('--target <dir>', 'Root directory to install into', process.cwd())
    .option('--claude-commands', 'Install only Claude command files', false)
    .option('--skill', 'Also install Claude skill files', false)
    .option('--scripts', 'Install only shell scripts', false)
    .option('--all', 'Install everything', false)
    .action(async (opts: InitOptions) => {
      await runInit(opts, templatesRoot);
    });
}
