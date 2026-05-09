import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export type UiPrefs = {
  daemonTick?: number;
  [key: string]: unknown;
};

function prefsPath(): string {
  const xdg = process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config');
  return join(xdg, 'token-smoulder', 'ui.json');
}

export async function loadPrefs(): Promise<UiPrefs> {
  try {
    const raw = await readFile(prefsPath(), 'utf8');
    return JSON.parse(raw) as UiPrefs;
  } catch {
    return {};
  }
}

export async function savePrefs(prefs: UiPrefs): Promise<void> {
  const p = prefsPath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(prefs, null, 2) + '\n', 'utf8');
}
