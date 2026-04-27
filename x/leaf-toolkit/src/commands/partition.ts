// `leaf partition` — walk the consumer repo, group source files into folder-
// aligned ~targetLoc-sized leaves, bin-pack oversize subtrees, and write:
//   leaves.gitignored.json   at the repo root
//   LEAF.partition[.bin-N].md at each leaf root (regenerated)
//   LEAF.audit[.bin-N].md     at each leaf root (only if missing)

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "../repo-root.js";

// Target ~1000 LOC; allow up to SPLIT_AT before forcing a split. Keeps small
// adjacent dirs together rather than fragmenting at every 1000-line boundary.
const TARGET_LOC = 1000;
const SPLIT_AT = 1500;

const EXTRA_ROOTS = ["scripts"];

const SOURCE_EXTS = new Set([".ts", ".tsx"]);
const TEST_FILE_RE = /\.(test|spec|stories|story|bench)\.(ts|tsx|mts)$/;

const EXCLUDE_DIR = new Set([
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

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function expandWorkspaces(REPO: string): string[] {
  const root = readJson(join(REPO, "package.json"));
  const patterns: string[] = root.workspaces || [];
  const out: string[] = [];
  for (const p of patterns) {
    if (p.endsWith("/*")) {
      const base = join(REPO, p.slice(0, -2));
      let entries;
      try {
        entries = readdirSync(base, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) if (e.isDirectory()) out.push(join(base, e.name));
    } else {
      out.push(join(REPO, p));
    }
  }
  return out;
}

function partitionRoots(REPO: string): string[] {
  const ws = expandWorkspaces(REPO);
  const extra = EXTRA_ROOTS.map((r) => join(REPO, r));
  // Drop nested workspaces so the parent partition covers them — avoids overlap.
  const sorted = [...ws, ...extra].sort();
  const top: string[] = [];
  for (const dir of sorted) {
    if (top.some((t) => dir === t || dir.startsWith(t + "/"))) continue;
    top.push(dir);
  }
  return top;
}

function isExcludedDir(name: string): boolean {
  if (EXCLUDE_DIR.has(name)) return true;
  if (name.endsWith(".gitignored")) return true;
  if (name.startsWith(".")) return true;
  return false;
}

function isSourceFile(name: string): boolean {
  if (TEST_FILE_RE.test(name)) return false;
  if (name.endsWith(".d.ts")) return false;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return SOURCE_EXTS.has(name.slice(dot));
}

function countLoc(path: string): number {
  const txt = readFileSync(path, "utf-8");
  let n = 0;
  for (const line of txt.split("\n")) if (line.trim() !== "") n++;
  return n;
}

interface FileNode {
  path: string;
  loc: number;
}
interface DirNode {
  path: string;
  files: FileNode[];
  dirs: DirNode[];
  fileLoc: number;
  subtreeLoc: number;
  allFiles: FileNode[];
}

function build(absPath: string, isRoot = false): DirNode | null {
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
      const child = build(p);
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

interface Leaf {
  path: string;
  scope: "subtree" | "bin";
  binIndex?: number;
  binTotal?: number;
  members?: string[];
  files: string[];
  loc: number;
}

interface BinItem {
  files: FileNode[];
  loc: number;
  label: string;
}

function partitionNode(node: DirNode, leaves: Leaf[], REPO: string): void {
  if (node.subtreeLoc === 0) return;
  if (node.subtreeLoc <= SPLIT_AT) {
    leaves.push({
      path: relative(REPO, node.path),
      scope: "subtree",
      files: node.allFiles.map((f) => relative(REPO, f.path)),
      loc: node.subtreeLoc,
    });
    return;
  }
  const small: BinItem[] = [];
  for (const d of node.dirs) {
    if (d.subtreeLoc > SPLIT_AT) {
      partitionNode(d, leaves, REPO);
    } else if (d.subtreeLoc > 0) {
      small.push({
        files: d.allFiles,
        loc: d.subtreeLoc,
        label: relative(REPO, d.path),
      });
    }
  }
  if (node.files.length > 0) {
    small.push({
      files: node.files,
      loc: node.fileLoc,
      label: `${relative(REPO, node.path)}/  (direct files)`,
    });
  }
  small.sort((a, b) => b.loc - a.loc);
  const bins: BinItem[][] = [];
  const binLoc: number[] = [];
  for (const item of small) {
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      if (binLoc[i] + item.loc <= SPLIT_AT) {
        bins[i].push(item);
        binLoc[i] += item.loc;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push([item]);
      binLoc.push(item.loc);
    }
  }
  if (bins.length === 0) return;
  bins.forEach((bin, idx) => {
    const allFiles = bin.flatMap((b) => b.files);
    leaves.push({
      path: relative(REPO, node.path),
      scope: bins.length === 1 ? "subtree" : "bin",
      binIndex: bins.length > 1 ? idx + 1 : undefined,
      binTotal: bins.length > 1 ? bins.length : undefined,
      members: bins.length > 1 ? bin.map((b) => b.label) : undefined,
      files: allFiles.map((f) => relative(REPO, f.path)),
      loc: binLoc[idx],
    });
  });
}

function leafDocPath(REPO: string, leaf: Leaf, domain: string): string {
  const suffix = leaf.binIndex !== undefined ? `.bin-${leaf.binIndex}` : "";
  return join(REPO, leaf.path, `LEAF.${domain}${suffix}.md`);
}

function partitionScaffold(leaf: Leaf): string {
  const scopeNote =
    leaf.scope === "subtree"
      ? "whole subtree"
      : `bin ${leaf.binIndex}/${leaf.binTotal} — covers a subset of siblings under this dir; companion bins cover the rest`;
  const memberLine = leaf.members
    ? `## Bin members\n\n${leaf.members.map((m) => `- \`${m}\``).join("\n")}\n\n`
    : "";
  return `---
domain: partition
leafPath: ${leaf.path}
scope: ${leaf.scope}
${leaf.binIndex !== undefined ? `binIndex: ${leaf.binIndex}\nbinTotal: ${leaf.binTotal}\n` : ""}loc: ${leaf.loc}
fileCount: ${leaf.files.length}
---

# Partition — \`${leaf.path}\`${leaf.binIndex !== undefined ? ` (bin ${leaf.binIndex}/${leaf.binTotal})` : ""}

- **Scope**: ${scopeNote}

${memberLine}## Files (${leaf.files.length})

${leaf.files.map((f) => `- \`${f}\``).join("\n")}
`;
}

function auditScaffold(leaf: Leaf): string {
  return `---
domain: audit
leafPath: ${leaf.path}
${leaf.binIndex !== undefined ? `binIndex: ${leaf.binIndex}\nbinTotal: ${leaf.binTotal}\n` : ""}---

# Audit — \`${leaf.path}\`${leaf.binIndex !== undefined ? ` (bin ${leaf.binIndex}/${leaf.binTotal})` : ""}

> Populated by sub-agent. Free-form context for downstream work loops.

## Primary risky logic

_(agent fills: 1–3 bits of risk-bearing logic in this leaf — auth, state mutation, fetch contracts, parsers, anything where a small bug has a big blast radius)_

## Most important code

_(agent fills: the load-bearing functions/files — the ~10% that explains the leaf)_

## Volatility (last 7 days)

- **Commits touching leaf files**: _(agent fills: count + 1-line summaries)_
- **Uncommitted changes (now)**: _(agent fills: which leaf files appear in \`git status\`)_
`;
}

export async function partition(_argv: string[]): Promise<void> {
  const REPO = repoRoot();
  const leaves: Leaf[] = [];
  for (const abs of partitionRoots(REPO)) {
    const node = build(abs, true);
    if (!node) continue;
    partitionNode(node, leaves, REPO);
  }
  leaves.sort((a, b) => a.path.localeCompare(b.path));

  const manifestPath = join(REPO, "leaves.gitignored.json");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        targetLoc: TARGET_LOC,
        splitAt: SPLIT_AT,
        leafCount: leaves.length,
        totalLoc: leaves.reduce((a, l) => a + l.loc, 0),
        totalFiles: leaves.reduce((a, l) => a + l.files.length, 0),
        leaves,
      },
      null,
      2,
    ) + "\n",
  );

  for (const leaf of leaves) {
    writeFileSync(leafDocPath(REPO, leaf, "partition"), partitionScaffold(leaf));
    const auditPath = leafDocPath(REPO, leaf, "audit");
    if (!existsSync(auditPath)) writeFileSync(auditPath, auditScaffold(leaf));
  }

  process.stdout.write(
    `Wrote ${leaves.length} leaves (${leaves.reduce((a, l) => a + l.loc, 0)} LOC, ${leaves.reduce((a, l) => a + l.files.length, 0)} files) → ${relative(REPO, manifestPath)}\n`,
  );
}
