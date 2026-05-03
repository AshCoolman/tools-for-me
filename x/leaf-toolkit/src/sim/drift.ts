// Drift between two PartitionRuns (FR-007). Compares prev → curr and classifies
// each file as added / removed / movedLeaf / renamed (heuristic), plus surfaces
// bin renumbering at the same parent path.

import type { Leaf, PartitionRun, DriftReport, BinSnapshot } from "./types.js";
import { leafIdentity } from "./overlap.js";

interface FileLocation {
  leafId: string;
  loc: number;
}

function indexFilesByPath(leaves: Leaf[]): Map<string, FileLocation> {
  // For each file path, the (single) leaf that owns it.
  // If a file appears in multiple leaves, the partition has overlap (FR-004
  // handles that separately) — we record the last seen for drift purposes.
  const out = new Map<string, FileLocation>();
  for (const leaf of leaves) {
    const id = leafIdentity(leaf);
    for (const file of leaf.files) {
      out.set(file, { leafId: id, loc: leaf.loc });
    }
  }
  return out;
}

function indexLeafIds(leaves: Leaf[]): Set<string> {
  return new Set(leaves.map(leafIdentity));
}

interface BinKey {
  parentPath: string;
  leaf: Leaf;
}

function indexBinsByParentPath(leaves: Leaf[]): Map<string, BinKey[]> {
  const out = new Map<string, BinKey[]>();
  for (const leaf of leaves) {
    if (leaf.scope !== "bin") continue;
    const arr = out.get(leaf.path);
    if (arr) arr.push({ parentPath: leaf.path, leaf });
    else out.set(leaf.path, [{ parentPath: leaf.path, leaf }]);
  }
  return out;
}

function binSnapshotOf(leaves: BinKey[]): BinSnapshot[] {
  return leaves
    .map(({ leaf }) => ({
      binId: leaf.binId ?? "",
      binIndex: leaf.binIndex ?? 0,
      files: [...leaf.files].sort(),
    }))
    .sort((a, b) => a.binId.localeCompare(b.binId));
}

function snapshotsEqual(a: BinSnapshot[], b: BinSnapshot[]): boolean {
  if (a.length !== b.length) return false;
  // Identity is binId; binIndex is sort/legibility only and may shift run-to-run.
  for (let i = 0; i < a.length; i++) {
    if (a[i].binId !== b[i].binId) return false;
    if (a[i].files.length !== b[i].files.length) return false;
    for (let j = 0; j < a[i].files.length; j++) {
      if (a[i].files[j] !== b[i].files[j]) return false;
    }
  }
  return true;
}

export function diffRuns(prev: PartitionRun, curr: PartitionRun): DriftReport {
  const prevByFile = indexFilesByPath(prev.leaves);
  const currByFile = indexFilesByPath(curr.leaves);

  const prevLeafIds = indexLeafIds(prev.leaves);
  const currLeafIds = indexLeafIds(curr.leaves);

  const filesAdded: DriftReport["filesAdded"] = [];
  const filesRemoved: DriftReport["filesRemoved"] = [];
  const filesMovedLeaf: DriftReport["filesMovedLeaf"] = [];
  const filesRenamed: DriftReport["filesRenamed"] = [];

  // Pass 1: files appearing in curr but not prev → candidates for added/renamed.
  // Pass 2: files appearing in prev but not curr → candidates for removed/renamed.
  // Pass 3: files in both → unchanged unless leaf changed (movedLeaf).

  const addedCandidates: Array<{ file: string; toLeaf: string; loc: number }> = [];
  const removedCandidates: Array<{ file: string; fromLeaf: string; loc: number }> = [];

  for (const [file, locInfo] of currByFile) {
    if (!prevByFile.has(file)) {
      addedCandidates.push({ file, toLeaf: locInfo.leafId, loc: locInfo.loc });
    } else {
      const prevLoc = prevByFile.get(file)!;
      if (prevLoc.leafId !== locInfo.leafId) {
        filesMovedLeaf.push({ file, fromLeaf: prevLoc.leafId, toLeaf: locInfo.leafId });
      }
    }
  }
  for (const [file, locInfo] of prevByFile) {
    if (!currByFile.has(file)) {
      removedCandidates.push({ file, fromLeaf: locInfo.leafId, loc: locInfo.loc });
    }
  }

  // Heuristic rename: same leaf id, same loc, one in added one in removed.
  const usedAdded = new Set<number>();
  const usedRemoved = new Set<number>();
  for (let i = 0; i < removedCandidates.length; i++) {
    const r = removedCandidates[i];
    for (let j = 0; j < addedCandidates.length; j++) {
      if (usedAdded.has(j)) continue;
      const a = addedCandidates[j];
      if (a.toLeaf === r.fromLeaf && a.loc === r.loc) {
        filesRenamed.push({ fromPath: r.file, toPath: a.file, leaf: a.toLeaf });
        usedAdded.add(j);
        usedRemoved.add(i);
        break;
      }
    }
  }

  for (let i = 0; i < addedCandidates.length; i++) {
    if (usedAdded.has(i)) continue;
    const a = addedCandidates[i];
    filesAdded.push({ file: a.file, toLeaf: a.toLeaf });
  }
  for (let i = 0; i < removedCandidates.length; i++) {
    if (usedRemoved.has(i)) continue;
    const r = removedCandidates[i];
    filesRemoved.push({ file: r.file, fromLeaf: r.fromLeaf });
  }

  // Bin renumbering: same parent path, different file-set under the same bin labels.
  const prevBins = indexBinsByParentPath(prev.leaves);
  const currBins = indexBinsByParentPath(curr.leaves);
  const binsRenumbered: DriftReport["binsRenumbered"] = [];
  const allBinPaths = new Set([...prevBins.keys(), ...currBins.keys()]);
  for (const path of allBinPaths) {
    const before = binSnapshotOf(prevBins.get(path) ?? []);
    const after = binSnapshotOf(currBins.get(path) ?? []);
    if (!snapshotsEqual(before, after)) {
      binsRenumbered.push({ path, before, after });
    }
  }

  const leavesAdded: string[] = [];
  for (const id of currLeafIds) if (!prevLeafIds.has(id)) leavesAdded.push(id);
  const leavesRemoved: string[] = [];
  for (const id of prevLeafIds) if (!currLeafIds.has(id)) leavesRemoved.push(id);

  filesAdded.sort((a, b) => a.file.localeCompare(b.file));
  filesRemoved.sort((a, b) => a.file.localeCompare(b.file));
  filesMovedLeaf.sort((a, b) => a.file.localeCompare(b.file));
  filesRenamed.sort((a, b) => a.fromPath.localeCompare(b.fromPath));
  binsRenumbered.sort((a, b) => a.path.localeCompare(b.path));
  leavesAdded.sort();
  leavesRemoved.sort();

  return {
    filesAdded,
    filesRemoved,
    filesMovedLeaf,
    filesRenamed,
    binsRenumbered,
    leavesAdded,
    leavesRemoved,
  };
}
