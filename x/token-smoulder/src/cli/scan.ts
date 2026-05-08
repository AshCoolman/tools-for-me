import { findOrchestrationDir, scanOrchestrations } from './orchestration.js';

export async function scanCommand(opts: { json: boolean }): Promise<number> {
  const dir = await findOrchestrationDir();
  const result = await scanOrchestrations(dir);
  if (opts.json) {
    process.stdout.write(JSON.stringify(result));
  } else {
    if (result.valid.length === 0 && result.invalid.length === 0) {
      process.stdout.write('No orchestrations found.\n');
    }
    for (const v of result.valid) {
      process.stdout.write(`valid:   ${v.name}  (${v.riskClass})\n`);
    }
    for (const iv of result.invalid) {
      const detail = iv.missing.length > 0 ? `missing=${iv.missing.join(',')}` : `errors=${iv.errors.join('; ')}`;
      process.stdout.write(`invalid: ${iv.name}  ${detail}\n`);
    }
  }
  return 0;
}
