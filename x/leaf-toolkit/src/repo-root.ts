// Resolve the consumer repo root. Honours `LEAF_REPO_ROOT`, then walks up
// from cwd looking for a directory that has both package.json and (when
// available) a leaves.gitignored.json — falling back to the first
// package.json found.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function repoRoot(): string {
  if (process.env.LEAF_REPO_ROOT) return resolve(process.env.LEAF_REPO_ROOT);
  let dir = process.cwd();
  let firstPkg: string | null = null;
  for (let i = 0; i < 30; i++) {
    if (existsSync(join(dir, "leaves.gitignored.json"))) return dir;
    if (firstPkg === null && existsSync(join(dir, "package.json"))) firstPkg = dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return firstPkg ?? process.cwd();
}
