import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEMPLATE_MAP: Record<string, string> = {
  intent: 'claude/commands/cslice.intent.md',
  contract: 'claude/commands/cslice.contract.md',
  review: 'claude/commands/cslice.review.md',
  tests: 'claude/commands/cslice.tests.md',
  implement: 'claude/commands/cslice.implement.md',
  verify: 'claude/commands/cslice.verify.md',
};

const VALID_TEMPLATES = Object.keys(TEMPLATE_MAP).join(', ');

export async function printTemplate(name: string, templatesRoot: string): Promise<void> {
  const relativePath = TEMPLATE_MAP[name];
  if (!relativePath) {
    process.stderr.write(
      `error: unknown template "${name}". Valid templates: ${VALID_TEMPLATES}\n`,
    );
    process.exit(1);
  }
  const content = await readFile(join(templatesRoot, relativePath), 'utf8');
  process.stdout.write(content);
}

export function buildPrintCommand(program: Command, templatesRoot: string): void {
  program
    .command('print <template>')
    .description(`Print a template to stdout (${VALID_TEMPLATES})`)
    .action(async (name: string) => {
      await printTemplate(name, templatesRoot);
    });
}
