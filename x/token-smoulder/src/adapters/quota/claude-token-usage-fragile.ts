import { spawn } from 'node:child_process';
import { z } from 'zod';
import { BoundaryError } from '../../lib/errors.js';
import type { QuotaSnapshot, QuotaSource } from './interface.js';

const SCHEMA = z.object({
  sessionRemainingFraction: z.number().min(0).max(1),
  weekRemainingFraction: z.number().min(0).max(1),
});

export type ClaudeTokenUsageFragileQuotaOptions = {
  env?: NodeJS.ProcessEnv;
};

export class ClaudeTokenUsageFragileQuota implements QuotaSource {
  private readonly env: NodeJS.ProcessEnv;
  constructor(opts: ClaudeTokenUsageFragileQuotaOptions = {}) {
    this.env = opts.env ?? process.env;
  }

  read(): Promise<QuotaSnapshot> {
    return new Promise((resolve, reject) => {
      const child = spawn('claude-token-usage-fragile', [], { env: this.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => (stdout += d.toString()));
      child.stderr.on('data', d => (stderr += d.toString()));
      child.on('error', err => {
        reject(new BoundaryError({
          endpoint: 'claude-token-usage-fragile',
          args: {},
          code: 'spawn_error',
          original: err.message,
        }));
      });
      child.on('close', code => {
        if (code !== 0) {
          reject(new BoundaryError({
            endpoint: 'claude-token-usage-fragile',
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
            endpoint: 'claude-token-usage-fragile',
            args: { stdout: stdout.slice(0, 200) },
            code: 'parse_error',
            original: e instanceof Error ? e.message : String(e),
          }));
          return;
        }
        resolve({
          session: parsed.sessionRemainingFraction,
          week: parsed.weekRemainingFraction,
          sampledAt: new Date().toISOString(),
          source: 'claude-token-usage-fragile',
        });
      });
    });
  }
}
