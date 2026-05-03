// FS-walking and DirNode construction. Extracted verbatim from
// `src/commands/partition.ts` so the simulator can build trees in two ways:
//   - buildFromFs(absRoot)       — real filesystem walk (production CLI uses this)
//   - buildFromMock(repoBase, descriptor) — synthetic tree from a JS object

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DirNode, FileNode } from "../types.js";

export const SOURCE_EXTS = new Set([".ts", ".tsx"]);
export const TEST_FILE_RE = /\.(test|spec|stories|story|bench)\.(ts|tsx|mts)$/;

export const EXCLUDE_DIR = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".vite",
  ".cache",
  "storybook-static",
  "playwright-report",
  "test-results",
  "tmp",
  "vendor",
  "__tests__",
  "__mocks__",
  "tests",
  "test",
  "e2e",
]);

export function isExcludedDir(name: string): boolean {
  if (EXCLUDE_DIR.has(name)) return true;
  if (name.endsWith(".gitignored")) return true;
  if (name.startsWith(".")) return true;
  return false;
}

export function isSourceFile(name: string): boolean {
  if (TEST_FILE_RE.test(name)) return false;
  if (name.endsWith(".d.ts")) return false;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return SOURCE_EXTS.has(name.slice(dot));
}

export function countLoc(path: string): number {
  const txt = readFileSync(path, "utf-8");
  let n = 0;
  for (const line of txt.split("\n")) if (line.trim() !== "") n++;
  return n;
}

function buildRecursive(absPath: string, isRoot: boolean): DirNode | null {
  const name = absPath.split("/").pop()!;
  if (!isRoot && isExcludedDir(name)) return null;
  let entries;
  try {
    entries = readdirSync(absPath, { withFileTypes: true });
  } catch {
    return null;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const files: FileNode[] = [];
  const dirs: DirNode[] = [];
  for (const e of entries) {
    const p = join(absPath, e.name);
    if (e.isDirectory()) {
      const child = buildRecursive(p, false);
      if (child && (child.files.length > 0 || child.dirs.length > 0)) dirs.push(child);
    } else if (e.isFile() && isSourceFile(e.name)) {
      files.push({ path: p, loc: countLoc(p) });
    }
  }
  const fileLoc = files.reduce((a, f) => a + f.loc, 0);
  const subtreeLoc = fileLoc + dirs.reduce((a, d) => a + d.subtreeLoc, 0);
  const allFiles = [...files, ...dirs.flatMap((d) => d.allFiles)];
  return { path: absPath, files, dirs, fileLoc, subtreeLoc, allFiles };
}

export function buildFromFs(absRoot: string): DirNode {
  const node = buildRecursive(absRoot, true);
  if (!node) {
    return { path: absRoot, files: [], dirs: [], fileLoc: 0, subtreeLoc: 0, allFiles: [] };
  }
  return node;
}

// Synthetic-tree descriptor: nested object where keys are entry names and values
// are either { loc: number } (file) or another descriptor (directory).
export type MockDescriptor = {
  [name: string]: MockDescriptor | { loc: number };
};

function isFileDesc(v: unknown): v is { loc: number } {
  return typeof v === "object" && v !== null && "loc" in v && typeof (v as { loc: unknown }).loc === "number";
}

function buildMockNode(absPath: string, descriptor: MockDescriptor): DirNode {
  const files: FileNode[] = [];
  const dirs: DirNode[] = [];
  const names = Object.keys(descriptor).sort((a, b) => a.localeCompare(b));
  for (const name of names) {
    const value = descriptor[name];
    const childPath = `${absPath}/${name}`;
    if (isFileDesc(value)) {
      files.push({ path: childPath, loc: value.loc });
    } else {
      const child = buildMockNode(childPath, value as MockDescriptor);
      if (child.files.length > 0 || child.dirs.length > 0) dirs.push(child);
    }
  }
  const fileLoc = files.reduce((a, f) => a + f.loc, 0);
  const subtreeLoc = fileLoc + dirs.reduce((a, d) => a + d.subtreeLoc, 0);
  const allFiles = [...files, ...dirs.flatMap((d) => d.allFiles)];
  return { path: absPath, files, dirs, fileLoc, subtreeLoc, allFiles };
}

export function buildFromMock(repoBase: string, descriptor: MockDescriptor): DirNode {
  return buildMockNode(repoBase, descriptor);
}
