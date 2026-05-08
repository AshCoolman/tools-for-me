import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOrchestrationDir } from './orchestration.js';

export type NewOptions = {
  json?: boolean;
};

const NAME_RE = /^[a-z][a-z0-9-]*$/;
const TEMPLATE_FILES = ['work.md', 'policy.ts', 'executor.ts'] as const;

export function templatesDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'work-unit');
}

function substitute(content: string, vars: Record<string, string>): string {
  let out = content;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
  }
  return out;
}

export async function newCommand(
  name: string,
  oneLiner: string,
  opts: NewOptions = {},
): Promise<number> {
  if (!NAME_RE.test(name)) {
    process.stderr.write(
      `new: name "${name}" must match /^[a-z][a-z0-9-]*$/ (lowercase, digits, dashes; starts with a letter)\n`,
    );
    return 2;
  }
  const trimmed = oneLiner.trim();
  if (trimmed.length === 0) {
    process.stderr.write('new: <one-liner> must be a non-empty string\n');
    return 2;
  }
  if (/[\r\n]/.test(trimmed)) {
    process.stderr.write('new: <one-liner> must be a single line (no newlines)\n');
    return 2;
  }

  const orchDir = await findOrchestrationDir();
  const targetDir = join(orchDir, name);
  const exists = await stat(targetDir).then(() => true).catch(() => false);
  if (exists) {
    process.stderr.write(`new: ${targetDir} already exists; refusing to overwrite\n`);
    return 4;
  }

  await mkdir(targetDir, { recursive: true });

  const tplDir = templatesDir();
  const written: string[] = [];
  for (const f of TEMPLATE_FILES) {
    const tpl = await readFile(join(tplDir, f), 'utf8');
    const rendered = substitute(tpl, { name, oneLiner: trimmed });
    const outPath = join(targetDir, f);
    await writeFile(outPath, rendered, 'utf8');
    written.push(outPath);
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ name, dir: targetDir, files: written })}\n`);
  } else {
    process.stdout.write(`Scaffolded ${targetDir}\n`);
    for (const p of written) process.stdout.write(`  ${p}\n`);
    process.stdout.write(`\nNext: fill the TODO markers in ${join(targetDir, 'work.md')}, then\n`);
    process.stdout.write(`run \`token-smoulder lint ${name}\` until it passes.\n`);
  }
  return 0;
}
