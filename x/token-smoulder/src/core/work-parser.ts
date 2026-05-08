import { MissingSectionError } from '../lib/errors.js';

export type Work = {
  sections: Map<string, string>;
  section(name: string): string;
};

export function parseWork(md: string): Work {
  const sections = new Map<string, string>();
  const lines = md.split('\n');
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current === null) return;
    while (buffer.length && buffer[0] === '') buffer.shift();
    sections.set(current, buffer.join('\n'));
  };

  for (const line of lines) {
    const m = /^# (.+?)\s*$/.exec(line);
    if (m) {
      flush();
      current = m[1] ?? '';
      buffer = [];
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  flush();

  return {
    sections,
    section(name: string): string {
      const v = sections.get(name);
      if (v === undefined) throw new MissingSectionError(name);
      return v;
    },
  };
}
