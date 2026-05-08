import { ClaudeTokenSimpleQuota } from '../adapters/quota/claude-token-simple.js';
import { ClaudeTokenUsageFragileQuota } from '../adapters/quota/claude-token-usage-fragile.js';
import type { QuotaSnapshot, QuotaSource } from '../adapters/quota/interface.js';
import type { ContentionDetector } from '../adapters/contention/interface.js';
import { ExternalSessionPidContentionDetector } from '../adapters/contention/external-session-pid.js';
import { AgentRemoteHumanInput } from '../adapters/input/agent-remote.js';
import { TerminalHumanInput } from '../adapters/input/terminal.js';
import { FileInboxHumanInput } from '../adapters/input/file-inbox.js';
import type { HumanInputChannel } from '../adapters/input/interface.js';

export function selectQuotaSource(): QuotaSource {
  const which = process.env.TOKEN_SMOULDER_QUOTA_SOURCE ?? '';
  if (which === 'fake-pass') return fakePassQuota();
  if (which === 'fake-fail') return fakeFailQuota();
  if (which === 'claude-token-usage-fragile') return new ClaudeTokenUsageFragileQuota();
  return new ClaudeTokenSimpleQuota();
}

export function selectContentionDetector(): ContentionDetector {
  const which = process.env.TOKEN_SMOULDER_CONTENTION ?? '';
  if (which === 'fake-quiet' || which === 'fake-pass' || which === '') {
    return {
      listExternalSessions: async () => [],
      isActiveWithin: async () => false,
    };
  }
  if (which === 'fake-busy') {
    return {
      listExternalSessions: async () => [{ pid: 1, command: 'fake' }],
      isActiveWithin: async () => true,
    };
  }
  return new ExternalSessionPidContentionDetector({ excludeOwnPid: process.pid });
}

export async function selectHumanInputChannel(stateDir: string): Promise<HumanInputChannel | null> {
  const candidates: HumanInputChannel[] = [
    new AgentRemoteHumanInput(),
    new TerminalHumanInput(),
    new FileInboxHumanInput({ stateDir }),
  ];
  for (const c of candidates) {
    if (await c.isAvailable()) return c;
  }
  return null;
}

function fakePassQuota(): QuotaSource {
  return {
    read: async (): Promise<QuotaSnapshot> => ({
      session: 1.0,
      week: 1.0,
      sampledAt: new Date().toISOString(),
      source: 'fake-pass',
    }),
  };
}

function fakeFailQuota(): QuotaSource {
  return {
    read: async (): Promise<QuotaSnapshot> => ({
      session: 0.05,
      week: 0.05,
      sampledAt: new Date().toISOString(),
      source: 'fake-fail',
    }),
  };
}
