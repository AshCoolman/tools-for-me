import { copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { mkdirp, fileExists, chmodX } from './fs.js';

export interface TemplateEntry {
  sourcePath: string;
  targetPath: string;
  executable?: boolean;
}

export type FileAction = 'CREATE' | 'SKIP' | 'OVERWRITE';

export interface FileResult {
  action: FileAction;
  path: string;
}

interface CopyOptions {
  templatesRoot: string;
  target: string;
  dryRun: boolean;
  force: boolean;
}

export async function copyTemplate(
  entries: TemplateEntry[],
  opts: CopyOptions,
): Promise<FileResult[]> {
  const results: FileResult[] = [];

  for (const entry of entries) {
    const src = join(opts.templatesRoot, entry.sourcePath);
    const dest = resolve(opts.target, entry.targetPath);
    const exists = await fileExists(dest);

    let action: FileAction;
    if (exists && !opts.force) {
      action = 'SKIP';
    } else if (exists && opts.force) {
      action = 'OVERWRITE';
    } else {
      action = 'CREATE';
    }

    if (!opts.dryRun && action !== 'SKIP') {
      await mkdirp(dirname(dest));
      await copyFile(src, dest);
      if (entry.executable) {
        await chmodX(dest);
      }
    }

    results.push({ action, path: entry.targetPath });
  }

  return results;
}
