// Resolve a CLI binary the consumer has installed as a dep. Walks up from
// `cwd` (or the given start dir) looking for `node_modules/.bin/<name>`.
// Returns null if not found — callers should fail loud with an install hint.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function findBin(name: string, start: string = process.cwd()): string | null {
  let dir = start;
  for (;;) {
    const candidate = join(dir, "node_modules", ".bin", name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
