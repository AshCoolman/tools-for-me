// Pure partitioning core. Extracted verbatim from `src/commands/partition.ts`
// so the simulator can call it without filesystem I/O.

import { createHash } from "node:crypto";
import { relative } from "node:path";
import type { DirNode, FileNode, Leaf, PartitionOptions } from "../types.js";

export const TARGET_LOC = 1000;
export const SPLIT_AT = 1500;
// Hysteresis margin around SPLIT_AT. Inside the band [SPLIT_AT*(1-h),
// SPLIT_AT*(1+h)] the choice between subtree and bin scope is sticky:
// directories with prior bin state stay in bin mode; otherwise default to a
// single subtree leaf (FR-005).
export const HYSTERESIS = 0.05;

export function computeBinId(sortedFilePaths: readonly string[]): string {
  return createHash("sha256").update(sortedFilePaths.join("\n")).digest("hex").slice(0, 6);
}

interface BinItem {
  files: FileNode[];
  loc: number;
  label: string;
}

function partitionNode(
  node: DirNode,
  leaves: Leaf[],
  REPO: string,
  priorBinDirs: ReadonlySet<string>,
): void {
  if (node.subtreeLoc === 0) return;
  const lowerBand = SPLIT_AT * (1 - HYSTERESIS);
  const upperBand = SPLIT_AT * (1 + HYSTERESIS);
  const relPath = relative(REPO, node.path);
  // Forced under-threshold: emit one subtree leaf.
  if (node.subtreeLoc <= lowerBand) {
    leaves.push({
      path: relPath,
      scope: "subtree",
      files: node.allFiles.map((f) => relative(REPO, f.path)),
      loc: node.subtreeLoc,
    });
    return;
  }
  // In the hysteresis band: stick with bin mode if there was prior bin state
  // for this dir; otherwise default to one subtree leaf (FR-005).
  if (node.subtreeLoc < upperBand && !priorBinDirs.has(relPath)) {
    leaves.push({
      path: relPath,
      scope: "subtree",
      files: node.allFiles.map((f) => relative(REPO, f.path)),
      loc: node.subtreeLoc,
    });
    return;
  }
  // Forced over-threshold (or in-band with prior bin state): bin-pack.
  const small: BinItem[] = [];
  for (const d of node.dirs) {
    if (d.subtreeLoc > upperBand) {
      partitionNode(d, leaves, REPO, priorBinDirs);
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
  // LPT (longest-processing-time) pack: pre-compute the target bin count from
  // total LOC, then place each item (largest first) into the bin with the
  // smallest current load. Eliminates the FFD "tail bin" pattern that left a
  // single small bin hosting the leftovers (host repo's 8.28× imbalance).
  small.sort((a, b) => b.loc - a.loc);
  const totalLoc = small.reduce((a, it) => a + it.loc, 0);
  const binCount = Math.max(1, Math.ceil(totalLoc / TARGET_LOC));
  const bins: BinItem[][] = Array.from({ length: binCount }, () => []);
  const binLoc: number[] = new Array(binCount).fill(0);
  for (const item of small) {
    let target = 0;
    for (let i = 1; i < binCount; i++) {
      if (binLoc[i] < binLoc[target]) target = i;
    }
    bins[target].push(item);
    binLoc[target] += item.loc;
  }
  // Drop empty bins (binCount over-estimated for tiny inputs) — must precede
  // the bins.length check below.
  for (let i = bins.length - 1; i >= 0; i--) {
    if (bins[i].length === 0) {
      bins.splice(i, 1);
      binLoc.splice(i, 1);
    }
  }
  if (bins.length === 0) return;
  const emitted: Leaf[] = [];
  bins.forEach((bin, idx) => {
    const allFiles = bin.flatMap((b) => b.files);
    const isBin = bins.length > 1;
    const relPaths = allFiles.map((f) => relative(REPO, f.path));
    emitted.push({
      path: relative(REPO, node.path),
      scope: isBin ? "bin" : "subtree",
      binIndex: isBin ? idx + 1 : undefined,
      binTotal: isBin ? bins.length : undefined,
      binId: isBin ? computeBinId([...relPaths].sort()) : undefined,
      members: isBin ? bin.map((b) => b.label) : undefined,
      files: relPaths,
      loc: binLoc[idx],
    });
  });
  if (bins.length > 1) {
    const seen = new Map<string, number>();
    for (const leaf of emitted) {
      if (!leaf.binId) continue;
      if (seen.has(leaf.binId)) {
        throw new Error(
          `binId collision in partition: ${leaf.path}: ${leaf.binId} (bins ${seen.get(leaf.binId)} and ${leaf.binIndex})`,
        );
      }
      seen.set(leaf.binId, leaf.binIndex!);
    }
  }
  leaves.push(...emitted);
}

export function partitionTree(
  root: DirNode,
  repoBase: string,
  options: PartitionOptions = {},
): Leaf[] {
  const leaves: Leaf[] = [];
  const priorBinDirs = options.priorBinDirs ?? new Set<string>();
  partitionNode(root, leaves, repoBase, priorBinDirs);
  leaves.sort((a, b) => a.path.localeCompare(b.path));
  return leaves;
}
