import { spawn } from 'node:child_process';
import { z } from 'zod';
import { BoundaryError } from '../../lib/errors.js';
import type { QuotaSnapshot, QuotaSource } from './interface.js';

const SCHEMA = z.object({
  session: z.number().min(0).max(1),
  week: z.number().min(0).max(1),
});

export type ClaudeTokenSimpleQuotaOptions = {
  env?: NodeJS.ProcessEnv;
};

export class ClaudeTokenSimpleQuota implements QuotaSource {
  private readonly env: NodeJS.ProcessEnv;
  constructor(opts: ClaudeTokenSimpleQuotaOptions = {}) {
    this.env = opts.env ?? process.env;
  }

  read(): Promise<QuotaSnapshot> {
    return new Promise((resolve, reject) => {
      const child = spawn('claude-token-simple', [], { env: this.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => (stdout += d.toString()));
      child.stderr.on('data', d => (stderr += d.toString()));
      child.on('error', err => {
        reject(new BoundaryError({
          endpoint: 'claude-token-simple',
          args: {},
          code: 'spawn_error',
          original: err.message,
        }));
      });
      child.on('close', code => {
        if (code !== 0) {
          reject(new BoundaryError({
            endpoint: 'claude-token-simple',
            args: {},
            code: code ?? -1,
            original: stderr.trim() || `exit ${code}`,
          }));
          return;
        }
        let parsed;
        try {
          const json = JSON.parse(stdout);
          parsed = SCHEMA.parse(json);
        } catch (e) {
          reject(new BoundaryError({
            endpoint: 'claude-token-simple',
            args: { stdout: stdout.slice(0, 200) },
            code: 'parse_error',
            original: e instanceof Error ? e.message : String(e),
          }));
          return;
        }
        resolve({
          session: parsed.session,
          week: parsed.week,
          sampledAt: new Date().toISOString(),
          source: 'claude-token-simple',
        });
      });
    });
  }
}
