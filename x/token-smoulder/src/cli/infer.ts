import type { RiskClass } from '../core/types.js';

const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'with', 'in', 'on',
  'at', 'by', 'from', 'as', 'is', 'be', 'are', 'was', 'were', 'this',
  'that', 'these', 'those', 'it', 'its', 'our', 'your', 'their', 'my',
]);

const RISK_VERBS: Array<{ class: RiskClass; verbs: string[] }> = [
  {
    class: 'networked',
    verbs: [
      'publish', 'post', 'send', 'deploy', 'push', 'upload', 'notify',
      'email', 'message', 'tweet', 'submit', 'webhook', 'call',
    ],
  },
  {
    class: 'repo-local',
    verbs: [
      'tidy', 'clean', 'cleanup', 'normalise', 'normalize', 'fix', 'refactor',
      'scaffold', 'generate', 'create', 'build', 'write', 'patch', 'drop',
      'delete', 'remove', 'rename', 'format', 'add', 'update',
      'modify', 'edit', 'install', 'extract', 'split', 'merge', 'rewrite',
      'migrate', 'convert', 'replace',
    ],
  },
  {
    class: 'readonly',
    verbs: [
      'read', 'list', 'report', 'summarise', 'summarize', 'audit', 'check',
      'inspect', 'scan', 'find', 'search', 'query', 'show', 'look',
      'browse', 'view', 'analyse', 'analyze', 'measure', 'count',
    ],
  },
];

export type RiskInference = {
  riskClass: RiskClass;
  signal: string;
};

export function inferRiskClass(idea: string): RiskInference {
  const tokens = idea.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    const cleaned = token.replace(/[^a-z]/g, '');
    if (cleaned.length === 0) continue;
    for (const group of RISK_VERBS) {
      if (group.verbs.includes(cleaned)) {
        return { riskClass: group.class, signal: `verb '${cleaned}'` };
      }
    }
  }
  return { riskClass: 'readonly', signal: 'no verb match (default)' };
}

export function inferName(idea: string, taken: Set<string>): string {
  const lower = idea.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const words = lower.split(/[\s-]+/).filter(w => w.length > 0 && !FILLER_WORDS.has(w));
  let base = words.slice(0, 4).join('-');
  if (base.length === 0) base = 'unit';
  if (!/^[a-z]/.test(base)) base = `unit-${base}`;
  base = base.slice(0, 30).replace(/-+$/, '');

  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
