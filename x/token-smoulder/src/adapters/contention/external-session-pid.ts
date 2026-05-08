import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ContentionDetector, ExternalSession } from './interface.js';

const exec = promisify(execFile);

export type ExternalSessionPidOptions = {
  patterns?: RegExp[];
  excludeOwnPid?: number;
};

const DEFAULT_PATTERNS: RegExp[] = [/(^|\/)claude(\s|$)/, /cursor/, /(^|\/)code(\s|$)/];

export class ExternalSessionPidContentionDetector implements ContentionDetector {
  private readonly patterns: RegExp[];
  private readonly excludeOwnPid: number | null;
  private readonly lastSeen = new Map<number, number>();

  constructor(opts: ExternalSessionPidOptions = {}) {
    this.patterns = opts.patterns ?? DEFAULT_PATTERNS;
    this.excludeOwnPid = opts.excludeOwnPid ?? null;
  }

  async listExternalSessions(): Promise<ExternalSession[]> {
    let out: string;
    try {
      const r = await exec('ps', ['-Ao', 'pid=,command=']);
      out = r.stdout;
    } catch {
      return [];
    }
    const sessions: ExternalSession[] = [];
    const now = Date.now();
    for (const rawLine of out.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const m = /^(\d+)\s+(.*)$/.exec(line);
      if (!m) continue;
      const pid = Number(m[1]);
      const command = m[2] ?? '';
      if (this.excludeOwnPid !== null && pid === this.excludeOwnPid) continue;
      if (!this.patterns.some(p => p.test(command))) continue;
      if (this.commandIsSchedulerOwned(command)) continue;
      if (await this.envIsSchedulerOwned(pid)) continue;
      this.lastSeen.set(pid, now);
      sessions.push({ pid, command, lastActiveAt: new Date(now).toISOString() });
    }
    return sessions;
  }

  private commandIsSchedulerOwned(command: string): boolean {
    return /--owner=scheduler\b/.test(command);
  }

  async isActiveWithin(durationMs: number): Promise<boolean> {
    const sessions = await this.listExternalSessions();
    if (sessions.length > 0) return true;
    const cutoff = Date.now() - durationMs;
    for (const t of this.lastSeen.values()) {
      if (t >= cutoff) return true;
    }
    return false;
  }

  private async envIsSchedulerOwned(pid: number): Promise<boolean> {
    try {
      const r = await exec('ps', ['-p', String(pid), '-E']);
      return /TOKEN_SMOULDER_OWNER=scheduler/.test(r.stdout);
    } catch {
      return false;
    }
  }
}
