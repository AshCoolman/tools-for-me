import { Command } from 'commander';
import { scanCommand } from './scan.js';
import { listCommand } from './list.js';
import { checkCommand } from './check.js';
import { runCommand } from './run.js';
import { unlockCommand } from './unlock.js';
import { daemonCommand } from './daemon.js';
import { stateCommand } from './state.js';
import { eventsCommand } from './events.js';
import { suppressionsCommand } from './suppressions.js';
import { clearSuppressionCommand } from './clear-suppression.js';
import { newCommand } from './new.js';
import { lintCommand } from './lint.js';
import { addCommand } from './add.js';
import { uiCommand } from './ui.js';

async function main(argv: string[]): Promise<number> {
  const program = new Command();
  program.name('token-smoulder').description('Local quota-aware AI work dispatcher');

  program
    .command('scan')
    .option('--json', 'emit JSON output', false)
    .action(async opts => {
      process.exitCode = await scanCommand({ json: !!opts.json });
    });

  program
    .command('list')
    .option('--json', 'emit JSON output', false)
    .action(async opts => {
      process.exitCode = await listCommand({ json: !!opts.json });
    });

  program
    .command('check <name>')
    .option('--json', 'emit JSON output', false)
    .option('--strict', 'exit 3 when policy fails', false)
    .option('--section <name>', 'work.md section to evaluate', 'Objective')
    .action(async (name: string, opts) => {
      process.exitCode = await checkCommand(name, {
        json: !!opts.json,
        strict: !!opts.strict,
        section: opts.section,
      });
    });

  program
    .command('run <name>')
    .option('--once', 'run exactly one dispatch cycle', false)
    .option('--resume', 'resume a previously paused/failed run', false)
    .option('--dry-run', 'print what would run without executing', false)
    .option('--json', 'emit JSON output', false)
    .option('--section <name>', 'work.md section to evaluate', 'Objective')
    .action(async (name: string, opts) => {
      process.exitCode = await runCommand(name, {
        json: !!opts.json,
        once: !!opts.once,
        resume: !!opts.resume,
        dryRun: !!opts.dryRun,
        section: opts.section,
      });
    });

  program
    .command('unlock [name]')
    .option('--global', 'clear the global lock instead of per-orchestration', false)
    .option('--force', 'override an alive-pid lock (requires TTY)', false)
    .action(async (name: string | undefined, opts) => {
      process.exitCode = await unlockCommand(name, {
        global: !!opts.global,
        force: !!opts.force,
      });
    });

  program
    .command('daemon')
    .option('--tick <ms>', 'override poll interval in ms')
    .option('--global-lock', 'hold a single global lock for the daemon', false)
    .action(async opts => {
      const tickRaw = opts.tick !== undefined ? Number(opts.tick) : undefined;
      const tick =
        tickRaw !== undefined && Number.isFinite(tickRaw) && tickRaw > 0 ? tickRaw : undefined;
      const result = await daemonCommand({
        globalLock: !!opts.globalLock,
        ...(tick !== undefined ? { tick } : {}),
      });
      process.exitCode = result;
    });

  program
    .command('state <name>')
    .action(async (name: string) => {
      process.exitCode = await stateCommand(name);
    });

  program
    .command('events')
    .option('--since <duration>', 'only events newer than this (e.g. 10m, 2h)')
    .option('--type <event>', 'filter by event name')
    .option('--limit <n>', 'maximum number of events to print', '100')
    .action(async opts => {
      const limit = Number(opts.limit);
      process.exitCode = await eventsCommand({
        since: opts.since,
        type: opts.type,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
      });
    });

  program
    .command('suppressions')
    .action(async () => {
      process.exitCode = await suppressionsCommand();
    });

  program
    .command('clear-suppression <key>')
    .action(async (key: string) => {
      process.exitCode = await clearSuppressionCommand(key);
    });

  program
    .command('new <name> <oneLiner>')
    .description('scaffold orchestration/<name>/ from a one-line idea')
    .option('--json', 'emit JSON output', false)
    .action(async (name: string, oneLiner: string, opts) => {
      process.exitCode = await newCommand(name, oneLiner, { json: !!opts.json });
    });

  program
    .command('lint <name>')
    .description('check that a work unit has no TODO sentinels and meets the quality rubric')
    .option('--json', 'emit JSON output', false)
    .action(async (name: string, opts) => {
      process.exitCode = await lintCommand(name, { json: !!opts.json });
    });

  program
    .command('add <ideaOrName>')
    .description(
      'idea → dispatch-ready in one shot: scaffold from a one-line idea (with auto name + riskClass + policy alignment), or re-verify an existing unit. Single verdict screen, single next-action line.',
    )
    .option('--json', 'emit JSON output', false)
    .option('--section <name>', 'work.md section to evaluate', 'Objective')
    .action(async (ideaOrName: string, opts) => {
      process.exitCode = await addCommand(ideaOrName, {
        json: !!opts.json,
        section: opts.section,
      });
    });

  program
    .command('ui')
    .description('start the local web UI')
    .option('--port <number>', 'port to listen on', '8788')
    .option('--host <addr>', 'bind address (loopback only)', '127.0.0.1')
    .option('--no-banner', 'suppress the URL banner')
    .action(async opts => {
      const port = Number(opts.port);
      process.exitCode = await uiCommand({
        port: Number.isFinite(port) && port >= 0 ? port : 8788,
        host: opts.host,
        banner: opts.banner !== false,
      });
    });

  await program.parseAsync(argv);
  return process.exitCode === undefined ? 0 : Number(process.exitCode);
}

main(process.argv).catch(err => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
