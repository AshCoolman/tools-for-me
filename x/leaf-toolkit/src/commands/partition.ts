// Stub: `leaf partition`. To be ported from scripts/leaf-partition.mts.
// Logic: walk repo, group files into ~targetLoc-sized leaves, split bins for
// oversized subtrees, write leaves.gitignored.json + per-leaf LEAF.partition.md.

export async function partition(_argv: string[]): Promise<void> {
  throw new Error("not yet ported — see fe-mono-closed/scripts/leaf-partition.mts");
}
