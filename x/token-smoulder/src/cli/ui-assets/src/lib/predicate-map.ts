export const PREDICATE_TO_GATE: Record<string, string> = {
  enoughQuota: 'capacity',
  quotaRemainingAbove: 'capacity',
  noExternalActiveSessions: 'contention',
  noExternalActiveSessionsFor: 'contention',
  keyboardIdleFor: 'contention',
  queuedWorkExists: 'value',
  workFileChanged: 'value',
  workFileChangedSinceLastRun: 'value',
  safeRiskClass: 'risk',
  classifyRisk: 'risk',
};

export type PredicateRange = {
  gate: string;
  startLine: number;
  endLine: number;
};

const PREDICATE_PATTERN = new RegExp(
  `\\b(${Object.keys(PREDICATE_TO_GATE).join('|')})\\s*\\(`,
  'g',
);

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

export function findPredicateRanges(source: string): PredicateRange[] {
  const ranges: PredicateRange[] = [];
  PREDICATE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = PREDICATE_PATTERN.exec(source)) !== null) {
    const predicateName = match[1];
    const gate = PREDICATE_TO_GATE[predicateName];
    const startLine = lineAt(source, match.index);

    // opening paren is the last char of the match
    let depth = 0;
    let endOffset = match.index + match[0].length - 1;
    for (let i = endOffset; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) { endOffset = i; break; }
      }
    }

    ranges.push({ gate, startLine, endLine: lineAt(source, endOffset) });
  }

  return ranges;
}

export function gateForLine(ranges: PredicateRange[], line: number): string | null {
  for (const range of ranges) {
    if (line >= range.startLine && line <= range.endLine) return range.gate;
  }
  return null;
}
