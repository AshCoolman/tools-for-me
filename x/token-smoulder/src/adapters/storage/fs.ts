import { appendFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import type {
  AgentSession,
  Event,
  EventName,
  LockFile,
  LockScope,
  RunRecord,
  SuppressionRecord,
} from './internal-types.js';
import {
  AgentSessionSchema,
  EventSchema,
  LockFileSchema,
  RunRecordSchema,
  SuppressionRecordSchema,
} from './internal-types.js';
import type { Storage } from './interface.js';

function lockPath(root: string, scope: LockScope): string {
  if (scope.scope === 'global') return join(root, 'locks', 'global.lock');
  return join(root, 'locks', `${scope.orchestrationName}.lock`);
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await rename(tmp, path);
}

export class FsStorage implements Storage {
  constructor(private readonly root: string) {}

  private eventsPath(): string {
    return join(this.root, 'events.ndjson');
  }

  private runsDir(name: string): string {
    return join(this.root, 'runs', name);
  }

  async appendEvent(event: Event): Promise<void> {
    EventSchema.parse(event);
    await ensureDir(this.root);
    await appendFile(this.eventsPath(), JSON.stringify(event) + '\n', 'utf8');
  }

  async readEvents(filter?: { sinceMs?: number; type?: EventName }): Promise<Event[]> {
    let raw: string;
    try {
      raw = await readFile(this.eventsPath(), 'utf8');
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const out: Event[] = [];
    const cutoff = filter?.sinceMs !== undefined ? Date.now() - filter.sinceMs : null;
    for (const line of raw.split('\n')) {
      if (!line) continue;
      const ev = JSON.parse(line) as Event;
      if (filter?.type && ev.name !== filter.type) continue;
      if (cutoff !== null) {
        const ts = Date.parse(ev.timestamp);
        if (Number.isFinite(ts) && ts < cutoff) continue;
      }
      out.push(ev);
    }
    return out;
  }

  async saveRun(record: RunRecord): Promise<void> {
    RunRecordSchema.parse(record);
    const dir = this.runsDir(record.orchestrationName);
    await ensureDir(dir);
    await writeJsonAtomic(join(dir, `${record.runId}.json`), record);
    await writeJsonAtomic(join(dir, 'latest.json'), record);
  }

  async loadLatestRun(orchestrationName: string): Promise<RunRecord | null> {
    const v = await readJson<RunRecord>(join(this.runsDir(orchestrationName), 'latest.json'));
    return v;
  }

  async loadRun(orchestrationName: string, runId: string): Promise<RunRecord | null> {
    return readJson<RunRecord>(join(this.runsDir(orchestrationName), `${runId}.json`));
  }

  async listRuns(orchestrationName: string): Promise<RunRecord[]> {
    const dir = this.runsDir(orchestrationName);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const out: RunRecord[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json') || name === 'latest.json') continue;
      const rec = await readJson<RunRecord>(join(dir, name));
      if (rec !== null) out.push(rec);
    }
    out.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return out;
  }

  async acquireLock(scope: LockScope, owner: 'scheduler'): Promise<LockFile> {
    const p = lockPath(this.root, scope);
    await ensureDir(dirname(p));
    const lock: LockFile = {
      pid: process.pid,
      hostname: hostname(),
      acquiredAt: new Date().toISOString(),
      owner,
      scope: scope.scope,
      ...(scope.scope === 'orchestration' ? { orchestrationName: scope.orchestrationName } : {}),
    };
    LockFileSchema.parse(lock);
    let fd;
    try {
      fd = await open(p, 'wx');
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        const existing = await readJson<LockFile>(p);
        const desc = existing ? `pid=${existing.pid} on ${existing.hostname}` : 'unknown holder';
        throw new Error(`lock contention at ${p}: ${desc}`);
      }
      throw e;
    }
    try {
      await fd.writeFile(JSON.stringify(lock, null, 2));
    } finally {
      await fd.close();
    }
    return lock;
  }

  async releaseLock(scope: LockScope): Promise<void> {
    const p = lockPath(this.root, scope);
    try {
      await rm(p);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  async inspectLock(scope: LockScope): Promise<LockFile | null> {
    return readJson<LockFile>(lockPath(this.root, scope));
  }

  async isLockStale(lock: LockFile, maxAgeMs: number): Promise<boolean> {
    try {
      process.kill(lock.pid, 0);
    } catch {
      return true;
    }
    const acquired = Date.parse(lock.acquiredAt);
    if (!Number.isFinite(acquired)) return true;
    return Date.now() - acquired > maxAgeMs;
  }

  private suppressionsDir(): string {
    return join(this.root, 'suppressions');
  }

  async saveSuppression(record: SuppressionRecord): Promise<void> {
    SuppressionRecordSchema.parse(record);
    await ensureDir(this.suppressionsDir());
    await writeJsonAtomic(join(this.suppressionsDir(), `${record.key}.json`), record);
  }

  async loadSuppression(key: string): Promise<SuppressionRecord | null> {
    return readJson<SuppressionRecord>(join(this.suppressionsDir(), `${key}.json`));
  }

  async listActiveSuppressions(): Promise<SuppressionRecord[]> {
    let entries: string[];
    try {
      entries = await readdir(this.suppressionsDir());
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
    const out: SuppressionRecord[] = [];
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const rec = await readJson<SuppressionRecord>(join(this.suppressionsDir(), name));
      if (rec === null) continue;
      if (rec.count >= 2 && rec.clearedAt === undefined) out.push(rec);
    }
    return out;
  }

  async clearSuppression(key: string): Promise<void> {
    const path = join(this.suppressionsDir(), `${key}.json`);
    const existing = await readJson<SuppressionRecord>(path);
    if (existing === null) return;
    const cleared: SuppressionRecord = { ...existing, clearedAt: new Date().toISOString() };
    await writeJsonAtomic(path, cleared);
  }

  async saveSession(session: AgentSession): Promise<void> {
    AgentSessionSchema.parse(session);
    const dir = join(this.root, 'sessions');
    await ensureDir(dir);
    await writeJsonAtomic(join(dir, `${session.sessionId}.json`), session);
  }

  async loadSession(sessionId: string): Promise<AgentSession | null> {
    return readJson<AgentSession>(join(this.root, 'sessions', `${sessionId}.json`));
  }
}

void stat;
