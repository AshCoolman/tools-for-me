// `leaf partition` — walk the consumer repo, group source files into folder-
// aligned ~targetLoc-sized leaves, bin-pack oversize subtrees, and write:
//   leaves.gitignored.json   at the repo root
//   LEAF.partition[.bin-N].md at each leaf root (regenerated)
//   LEAF.audit[.bin-N].md     at each leaf root (only if missing)

import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../repo-root.js";
import { buildFromFs } from "../sim/core/dirnode.js";
import { partitionTree, TARGET_LOC, SPLIT_AT } from "../sim/core/partition-core.js";
import { readPriorBinDirsFromFs } from "../sim/core/prior-state.js";
import type {
  Leaf,
  MigrationOrphan,
  MigrationRename,
  MigrationReport,
  MigrationUnchanged,
} from "../sim/types.js";

const EXTRA_ROOTS = ["scripts"];

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

function leafDocPath(REPO: string, leaf: Leaf, domain: string): string {
  const suffix = leaf.binId !== undefined ? `.bin-${leaf.binId}` : "";
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
${leaf.binId !== undefined ? `binId: ${leaf.binId}\nbinIndex: ${leaf.binIndex}\nbinTotal: ${leaf.binTotal}\n` : ""}loc: ${leaf.loc}
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
${leaf.binId !== undefined ? `binId: ${leaf.binId}\nbinIndex: ${leaf.binIndex}\nbinTotal: ${leaf.binTotal}\n` : ""}---

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

// ─── Migration helpers ────────────────────────────────────────────────────────

const MIGRATION_DOMAINS = new Set(["priority", "audit", "partition", "coverage"]);
const BIN_DOC_NAME_RE = /^LEAF\.([a-z]+)\.bin-([A-Za-z0-9]+)\.md$/;

interface OnDiskBinDoc {
  abs: string;
  parentRel: string;
  domain: string;
  oldSuffix: string;
  isLegacyNumeric: boolean;
}

interface PriorManifestLeaf {
  path: string;
  binIndex?: number;
  binId?: string;
  files?: string[];
}

function findOnDiskBinDocs(REPO: string, roots: readonly string[]): OnDiskBinDoc[] {
  const out: OnDiskBinDoc[] = [];
  const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
  function walk(dir: string): void {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isFile()) {
        const m = e.name.match(BIN_DOC_NAME_RE);
        if (m) {
          const domain = m[1];
          if (!MIGRATION_DOMAINS.has(domain)) continue;
          const abs = join(dir, e.name);
          const parentRel = relative(REPO, dir);
          out.push({
            abs,
            parentRel,
            domain,
            oldSuffix: m[2],
            isLegacyNumeric: /^\d+$/.test(m[2]),
          });
        }
      } else if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith(".")) {
        walk(join(dir, e.name));
      }
    }
  }
  for (const r of roots) walk(r);
  return out;
}

function readPriorManifest(REPO: string): PriorManifestLeaf[] | null {
  const path = join(REPO, "leaves.gitignored.json");
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as { leaves?: PriorManifestLeaf[] };
    return raw.leaves ?? null;
  } catch {
    return null;
  }
}

function classifyOnDiskDoc(
  doc: OnDiskBinDoc,
  newLeavesByDir: Map<string, Leaf[]>,
  priorByDirAndIndex: Map<string, Map<number, PriorManifestLeaf>>,
):
  | { kind: "rename"; entry: MigrationRename; newName: string }
  | { kind: "unchanged"; entry: MigrationUnchanged }
  | { kind: "orphan"; entry: MigrationOrphan } {
  const newLeavesAtDir = newLeavesByDir.get(doc.parentRel) ?? [];
  const newBins = newLeavesAtDir.filter((l) => l.binId);

  // Already-hashed suffix → match by binId.
  if (!doc.isLegacyNumeric) {
    const hit = newBins.find((l) => l.binId === doc.oldSuffix);
    if (hit) {
      return {
        kind: "unchanged",
        entry: {
          name: `LEAF.${doc.domain}.bin-${doc.oldSuffix}.md`,
          leafPath: doc.parentRel,
          reason: "already migrated",
        },
      };
    }
    return {
      kind: "orphan",
      entry: {
        name: `LEAF.${doc.domain}.bin-${doc.oldSuffix}.md`,
        leafPath: doc.parentRel,
        reason: "no matching bin in new partition",
      },
    };
  }

  // Legacy numeric → consult prior manifest for the file-set if available.
  const oldIndex = Number(doc.oldSuffix);
  const priorLeaf = priorByDirAndIndex.get(doc.parentRel)?.get(oldIndex);
  if (priorLeaf?.files && priorLeaf.files.length > 0) {
    let bestOverlap = 0;
    let bestLeaf: Leaf | null = null;
    let tieAt = 0;
    for (const newLeaf of newBins) {
      const overlap = newLeaf.files.filter((f) => priorLeaf.files!.includes(f)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestLeaf = newLeaf;
        tieAt = 1;
      } else if (overlap === bestOverlap && bestOverlap > 0) {
        tieAt++;
      }
    }
    if (bestLeaf && bestOverlap > 0 && tieAt === 1) {
      const newName = `LEAF.${doc.domain}.bin-${bestLeaf.binId}.md`;
      return {
        kind: "rename",
        entry: {
          oldName: `LEAF.${doc.domain}.bin-${doc.oldSuffix}.md`,
          newName,
          leafPath: doc.parentRel,
          domain: doc.domain,
        },
        newName,
      };
    }
    if (tieAt > 1) {
      return {
        kind: "orphan",
        entry: {
          name: `LEAF.${doc.domain}.bin-${doc.oldSuffix}.md`,
          leafPath: doc.parentRel,
          reason: "ambiguous match",
        },
      };
    }
  }

  // No prior manifest (or no useful prior leaf) → enclosing-directory fallback.
  // If new bin count matches the legacy bin count for this domain at this dir,
  // and indexing is unambiguous, map by 1-based index.
  if (newBins.length === 1) {
    const newName = `LEAF.${doc.domain}.bin-${newBins[0].binId}.md`;
    return {
      kind: "rename",
      entry: {
        oldName: `LEAF.${doc.domain}.bin-${doc.oldSuffix}.md`,
        newName,
        leafPath: doc.parentRel,
        domain: doc.domain,
      },
      newName,
    };
  }
  if (newBins.length > 1 && newBins.length >= oldIndex && oldIndex >= 1) {
    const sorted = [...newBins].sort((a, b) => (a.binIndex ?? 0) - (b.binIndex ?? 0));
    const target = sorted[oldIndex - 1];
    if (target?.binId) {
      const newName = `LEAF.${doc.domain}.bin-${target.binId}.md`;
      return {
        kind: "rename",
        entry: {
          oldName: `LEAF.${doc.domain}.bin-${doc.oldSuffix}.md`,
          newName,
          leafPath: doc.parentRel,
          domain: doc.domain,
        },
        newName,
      };
    }
  }
  return {
    kind: "orphan",
    entry: {
      name: `LEAF.${doc.domain}.bin-${doc.oldSuffix}.md`,
      leafPath: doc.parentRel,
      reason: newBins.length === 0 ? "no matching bin in new partition" : "ambiguous match",
    },
  };
}

export function runMigration(
  REPO: string,
  leaves: Leaf[],
  rootsOverride?: readonly string[],
): MigrationReport {
  const roots = rootsOverride ?? partitionRoots(REPO);
  const onDisk = findOnDiskBinDocs(REPO, roots);

  const newLeavesByDir = new Map<string, Leaf[]>();
  for (const l of leaves) {
    const arr = newLeavesByDir.get(l.path) ?? [];
    arr.push(l);
    newLeavesByDir.set(l.path, arr);
  }

  const prior = readPriorManifest(REPO);
  const priorByDirAndIndex = new Map<string, Map<number, PriorManifestLeaf>>();
  if (prior) {
    for (const l of prior) {
      if (l.binIndex === undefined) continue;
      const dirMap = priorByDirAndIndex.get(l.path) ?? new Map<number, PriorManifestLeaf>();
      dirMap.set(l.binIndex, l);
      priorByDirAndIndex.set(l.path, dirMap);
    }
  }

  const renamed: MigrationRename[] = [];
  const unchanged: MigrationUnchanged[] = [];
  const orphaned: MigrationOrphan[] = [];

  for (const doc of onDisk) {
    const result = classifyOnDiskDoc(doc, newLeavesByDir, priorByDirAndIndex);
    if (result.kind === "rename") {
      const target = join(dirname(doc.abs), result.newName);
      if (target === doc.abs) {
        unchanged.push({
          name: doc.abs.split("/").pop()!,
          leafPath: doc.parentRel,
          reason: "same hash",
        });
      } else {
        renameSync(doc.abs, target);
        renamed.push(result.entry);
      }
    } else if (result.kind === "unchanged") {
      unchanged.push(result.entry);
    } else {
      orphaned.push(result.entry);
    }
  }

  return { renamed, unchanged, orphaned };
}

function printMigrationReport(REPO: string, report: MigrationReport, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  process.stdout.write(`Migrating bin labels in ${REPO}\n`);
  const total = report.renamed.length + report.unchanged.length + report.orphaned.length;
  process.stdout.write(`Found ${total} LEAF.*.bin-*.md files.\n\n`);
  if (report.renamed.length > 0) {
    process.stdout.write(`Renamed (${report.renamed.length}):\n`);
    for (const r of report.renamed) {
      process.stdout.write(`  ${r.leafPath}/${r.oldName}  →  ${r.newName}\n`);
    }
  }
  if (report.unchanged.length > 0) {
    process.stdout.write(`Unchanged (${report.unchanged.length}):\n`);
    for (const u of report.unchanged) {
      process.stdout.write(`  ${u.leafPath}/${u.name}  (${u.reason})\n`);
    }
  }
  if (report.orphaned.length > 0) {
    process.stdout.write(`Orphaned (${report.orphaned.length}):\n`);
    for (const o of report.orphaned) {
      process.stdout.write(`  ${o.leafPath}/${o.name}  (${o.reason})\n`);
    }
  }
}

export async function partition(_argv: string[]): Promise<void> {
  const migrate = _argv.includes("--migrate-bin-labels");
  const json = _argv.includes("--json");
  const REPO = repoRoot();
  const leaves: Leaf[] = [];
  for (const abs of partitionRoots(REPO)) {
    const root = buildFromFs(abs);
    const priorBinDirs = readPriorBinDirsFromFs(REPO, [abs]);
    const subLeaves = partitionTree(root, REPO, { priorBinDirs });
    leaves.push(...subLeaves);
  }
  leaves.sort((a, b) => a.path.localeCompare(b.path));

  if (migrate) {
    const report = runMigration(REPO, leaves);
    // Re-write the manifest with the new partition (so subsequent commands see binIds).
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
    printMigrationReport(REPO, report, json);
    return;
  }

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
