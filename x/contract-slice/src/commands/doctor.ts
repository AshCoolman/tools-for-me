import { Command } from 'commander';
import kleur from 'kleur';
import { join } from 'node:path';
import { access, constants } from 'node:fs/promises';
import { fileExists } from '../utils/fs.js';
import { detectPackageManager, hasScript } from '../utils/detect-project.js';

export type DoctorStatus = 'PASS' | 'WARN' | 'FAIL';

export interface DoctorItem {
  status: DoctorStatus;
  label: string;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(target: string): Promise<DoctorItem[]> {
  const items: DoctorItem[] = [];

  // Checks 1–6: command files (FAIL if absent)
  const commandFiles = [
    'cslice.intent.md',
    'cslice.contract.md',
    'cslice.review.md',
    'cslice.tests.md',
    'cslice.implement.md',
    'cslice.verify.md',
  ];

  for (const file of commandFiles) {
    const path = join(target, '.claude', 'commands', file);
    const exists = await fileExists(path);
    items.push({
      status: exists ? 'PASS' : 'FAIL',
      label: `.claude/commands/${file} exists`,
    });
  }

  // Check 7: scripts/cslice-verify.sh exists (WARN)
  const scriptPath = join(target, 'scripts', 'cslice-verify.sh');
  const scriptExists = await fileExists(scriptPath);
  items.push({
    status: scriptExists ? 'PASS' : 'WARN',
    label: 'scripts/cslice-verify.sh exists',
  });

  // Check 8: scripts/cslice-verify.sh is executable (WARN)
  const exec = scriptExists && await isExecutable(scriptPath);
  items.push({
    status: exec ? 'PASS' : 'WARN',
    label: 'scripts/cslice-verify.sh is executable',
  });

  // Check 9: package manager lockfile (WARN)
  const pm = await detectPackageManager(target);
  items.push({
    status: pm !== null ? 'PASS' : 'WARN',
    label: 'package manager detected (lockfile found)',
  });

  // Check 10: tsconfig.json (WARN)
  const tsconfigExists = await fileExists(join(target, 'tsconfig.json'));
  items.push({
    status: tsconfigExists ? 'PASS' : 'WARN',
    label: 'tsconfig.json exists',
  });

  // Checks 11–14: package.json scripts (WARN)
  for (const scriptName of ['typecheck', 'test', 'lint', 'build']) {
    const has = await hasScript(target, scriptName);
    items.push({
      status: has ? 'PASS' : 'WARN',
      label: `package.json has "${scriptName}" script`,
    });
  }

  return items;
}

export function buildDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check Contract Slice installation health')
    .option('--target <dir>', 'Directory to inspect', process.cwd())
    .action(async (opts: { target: string }) => {
      const items = await runDoctor(opts.target);
      let hasFailure = false;
      for (const item of items) {
        const status =
          item.status === 'PASS' ? kleur.green('PASS') :
          item.status === 'WARN' ? kleur.yellow('WARN') :
          kleur.red('FAIL');
        process.stdout.write(`${status} ${item.label}\n`);
        if (item.status === 'FAIL') hasFailure = true;
      }
      if (hasFailure) process.exit(1);
    });
}
