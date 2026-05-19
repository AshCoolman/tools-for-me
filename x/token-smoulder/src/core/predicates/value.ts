import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Predicate } from '../types.js';

export const TODO_SENTINEL = 'TODO(token-smoulder)';

export function noTodoSentinels(workMd: string): Predicate {
  return async () => {
    const sections = sectionsContainingSentinel(workMd);
    if (sections.length > 0) {
      return {
        ok: false,
        reason: `noTodoSentinels: TODO markers remain in section(s): ${sections.join(', ')}`,
      };
    }
    return { ok: true, reason: 'noTodoSentinels' };
  };
}

function sectionsContainingSentinel(md: string): string[] {
  const lines = md.split('\n');
  const found = new Set<string>();
  let current = '<preamble>';
  for (const line of lines) {
    const m = /^# (.+?)\s*$/.exec(line);
    if (m) current = m[1] ?? '<preamble>';
    else if (line.includes(TODO_SENTINEL)) found.add(current);
  }
  return [...found];
}

export type ValueCtx = {
  orchestrationName: string;
  workMd: string;
  workHash: string;
  selectedSection: string;
  storage: {
    loadLatestRun(orchestrationName: string): Promise<{ workHash: string; status: string } | null>;
  };
};

export function queuedWorkExists(ctx: ValueCtx): Predicate {
  return async () => {
    const sectionRe = new RegExp(`^# ${escapeRegex(ctx.selectedSection)}\\s*$`, 'm');
    const m = sectionRe.exec(ctx.workMd);
    if (!m) {
      return { ok: false, reason: `queuedWorkExists: section "${ctx.selectedSection}" missing` };
    }
    const after = ctx.workMd.slice(m.index + m[0].length);
    const next = /\n# /.exec(after);
    const body = next ? after.slice(0, next.index) : after;
    if (body.trim().length === 0) {
      return { ok: false, reason: `queuedWorkExists: section "${ctx.selectedSection}" empty` };
    }
    const latest = await ctx.storage.loadLatestRun(ctx.orchestrationName);
    if (latest && latest.workHash === ctx.workHash && latest.status === 'completed') {
      return { ok: false, reason: 'queuedWorkExists: current work already completed' };
    }
    return { ok: true, reason: 'queuedWorkExists' };
  };
}

export function noBlockFile(unitDir: string): Predicate {
  return async () => {
    try {
      await stat(join(unitDir, 'BLOCKED.md'));
      return { ok: false, reason: 'noBlockFile: BLOCKED.md exists — human action required' };
    } catch {
      return { ok: true, reason: 'noBlockFile' };
    }
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
