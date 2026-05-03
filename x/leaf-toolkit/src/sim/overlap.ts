// File-level overlap detection across leaves of a single partition run.
// FR-004: any file path in ≥2 leaves' files[] is reported with offending leaves.

import type { Leaf, OverlapReport } from "./types.js";

export function leafIdentity(leaf: Leaf): string {
  return leaf.binId ? `${leaf.path}#${leaf.binId}` : leaf.path;
}

export function checkOverlap(leaves: Leaf[]): OverlapReport {
  const fileToLeaves = new Map<string, string[]>();
  const intraLeafDuplicates: Array<{ leaf: string; file: string }> = [];

  for (const leaf of leaves) {
    const id = leafIdentity(leaf);
    const seenInLeaf = new Set<string>();
    for (const file of leaf.files) {
      if (seenInLeaf.has(file)) {
        intraLeafDuplicates.push({ leaf: id, file });
      } else {
        seenInLeaf.add(file);
      }
      const arr = fileToLeaves.get(file);
      if (arr) {
        if (!arr.includes(id)) arr.push(id);
      } else {
        fileToLeaves.set(file, [id]);
      }
    }
  }

  const overlaps: Array<{ file: string; leaves: string[] }> = [];
  for (const [file, owners] of fileToLeaves) {
    if (owners.length > 1) overlaps.push({ file, leaves: owners });
  }
  overlaps.sort((a, b) => a.file.localeCompare(b.file));

  return {
    overlapCount: overlaps.length,
    overlaps,
    intraLeafDuplicates,
  };
}
