import { readFile, writeFile, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ulid } from 'ulid';
import { normalizeFailureSignature } from './suppression.js';

export type MatchType = 'contains' | 'regex' | 'signature';

export type UiAction = {
  type: 'clear-suppression' | 'unlock' | 'link';
  target?: string;
};

export type PlaybookRule = {
  id: string;
  match: { type: MatchType; value: string };
  explanation: string;
  remediation: string;
  uiAction?: UiAction;
  enabled: boolean;
  hits: number;
  createdAt: string;
  source: 'claude' | 'manual';
};

const FILENAME = 'error-playbook.json';

function playbookPath(stateDir: string): string {
  return join(stateDir, FILENAME);
}

export async function loadPlaybook(stateDir: string): Promise<PlaybookRule[]> {
  try {
    const raw = await readFile(playbookPath(stateDir), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PlaybookRule[];
  } catch {
    return [];
  }
}

export async function savePlaybook(stateDir: string, rules: PlaybookRule[]): Promise<void> {
  const p = playbookPath(stateDir);
  const tmp = p + '.tmp';
  await writeFile(tmp, JSON.stringify(rules, null, 2));
  await rename(tmp, p);
}

export async function appendRule(
  stateDir: string,
  input: Omit<PlaybookRule, 'id' | 'hits' | 'createdAt'>,
): Promise<PlaybookRule> {
  const rules = await loadPlaybook(stateDir);
  const rule: PlaybookRule = {
    ...input,
    id: ulid(),
    hits: 0,
    createdAt: new Date().toISOString(),
  };
  rules.push(rule);
  await savePlaybook(stateDir, rules);
  return rule;
}

function testMatch(rule: PlaybookRule, error: string, signature: string): boolean {
  switch (rule.match.type) {
    case 'signature':
      return signature === rule.match.value;
    case 'contains':
      return error.toLowerCase().includes(rule.match.value.toLowerCase());
    case 'regex':
      try {
        return new RegExp(rule.match.value, 'i').test(error);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

const MATCH_ORDER: MatchType[] = ['signature', 'contains', 'regex'];

export function matchError(error: string, rules: PlaybookRule[]): PlaybookRule | null {
  const signature = normalizeFailureSignature(error);
  for (const type of MATCH_ORDER) {
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.match.type !== type) continue;
      if (testMatch(rule, error, signature)) return rule;
    }
  }
  return null;
}

export type InterpretContext = {
  error: string;
  orchestrationName: string;
  gateResults?: string[];
  stepPrompt?: string;
};

export type InterpretResult = {
  explanation: string;
  remediation: string;
};

function buildPrompt(ctx: InterpretContext): string {
  const parts = [
    'You are an error interpreter for an orchestration system.',
    'A run failed with the following error. Explain what happened and how to fix it.',
    '',
    `Orchestration: ${ctx.orchestrationName}`,
  ];
  if (ctx.stepPrompt) parts.push(`Step prompt: ${ctx.stepPrompt}`);
  if (ctx.gateResults?.length) parts.push(`Gate results: ${ctx.gateResults.join('; ')}`);
  parts.push('', `Error: ${ctx.error}`, '',
    'Respond in exactly this format (two lines, no markdown):',
    'EXPLANATION: <one sentence explaining what happened>',
    'REMEDIATION: <one sentence explaining what to do>',
  );
  return parts.join('\n');
}

export function parseInterpretResponse(text: string): InterpretResult | null {
  const expMatch = text.match(/EXPLANATION:\s*(.+)/i);
  const remMatch = text.match(/REMEDIATION:\s*(.+)/i);
  if (!expMatch || !remMatch) return null;
  return {
    explanation: expMatch[1]!.trim(),
    remediation: remMatch[1]!.trim(),
  };
}

function spawnClaude(prompt: string): Promise<string> {
  const bin = process.env.TOKEN_SMOULDER_AGENT_BIN ?? 'claude';
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['-p', '--output-format', 'text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TOKEN_SMOULDER_OWNER: 'playbook' },
    });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) reject(new Error(`claude exit ${code}`));
      else resolve(stdout.trim());
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function interpretError(
  stateDir: string,
  ctx: InterpretContext,
): Promise<PlaybookRule | null> {
  const prompt = buildPrompt(ctx);
  let raw: string;
  try {
    raw = await spawnClaude(prompt);
  } catch {
    return null;
  }
  const parsed = parseInterpretResponse(raw);
  if (!parsed) return null;
  const signature = normalizeFailureSignature(ctx.error);
  return appendRule(stateDir, {
    match: { type: 'signature', value: signature },
    explanation: parsed.explanation,
    remediation: parsed.remediation,
    enabled: true,
    source: 'claude',
  });
}
