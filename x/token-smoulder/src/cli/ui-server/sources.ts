import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type SourceCandidate = {
  path: string;
  title: string;
  snippet: string;
};

export async function discoverSources(): Promise<SourceCandidate[]> {
  const candidates: SourceCandidate[] = [];

  const inboxPath = join(homedir(), 'ac', 'ideas', 'inbox.md');
  try {
    const content = await readFile(inboxPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<!--')) continue;
      const text = trimmed.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
      if (text.length === 0) continue;
      candidates.push({
        path: inboxPath,
        title: text.length > 80 ? text.slice(0, 79) + '…' : text,
        snippet: text,
      });
    }
  } catch { /* inbox.md might not exist */ }

  try {
    const specFiles = await findMdFiles('specs');
    for (const filePath of specFiles) {
      try {
        const content = await readFile(filePath, 'utf8');
        const heading = content.match(/^#\s+(.+)/m);
        const title = heading?.[1] ?? filePath;
        const firstLines = content.split('\n').filter(l => l.trim()).slice(0, 3);
        candidates.push({
          path: filePath,
          title,
          snippet: firstLines.join(' ').slice(0, 120),
        });
      } catch { /* skip unreadable */ }
    }
  } catch { /* specs/ might not exist */ }

  return candidates;
}

async function findMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await findMdFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}
