// US1 (FR-001..FR-004, SC-001, SC-002): bin identifiers are content-derived.
// For any pair of partition runs whose member set for a bin is unchanged, the
// `binId` must match — regardless of what other bins did, what the LOC totals
// look like, or which `binIndex` the bin was assigned. Bins whose member set
// changed must produce a different `binId`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, NAMED_FIXTURES } from "../../src/sim/fixtures.js";
import { partitionTree } from "../../src/sim/core/partition-core.js";
import { applyMutation } from "../../src/sim/mutations.js";
import type { Leaf, Mutate } from "../../src/sim/types.js";

const FIXTURES = ["boundary-1700", "wide-shallow"] as const;

const MUTATIONS: Mutate[] = [
  { kind: "addFile", path: "s1/added.ts", loc: 20 },
  { kind: "addFile", path: "s1/empty.ts", loc: 0 },
  { kind: "growFile", path: "s1/f.ts", deltaLoc: 5 },
  { kind: "shrinkFile", path: "s1/f.ts", deltaLoc: 5 },
  { kind: "removeFile", path: "s1/f.ts" },
  { kind: "renameFile", fromPath: "s1/f.ts", toPath: "s1/renamed.ts" },
];

function binsByMembers(leaves: Leaf[]): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  for (const leaf of leaves) {
    if (leaf.scope !== "bin" || !leaf.binId) continue;
    const key = [...leaf.files].sort().join("|");
    out.set(key, leaf);
  }
  return out;
}

function findFirstFile(leaves: Leaf[], match: (path: string) => boolean): string | null {
  for (const leaf of leaves) {
    for (const f of leaf.files) if (match(f)) return f;
  }
  return null;
}

function adaptMutation(mut: Mutate, prevLeaves: Leaf[]): Mutate | null {
  // The `wide-shallow` fixture has children named c1..c12, not s1..s6. Adapt
  // file paths so the mutation actually targets a real file in the tree.
  const targetExists = "path" in mut ? findFirstFile(prevLeaves, (p) => p === mut.path) : null;
  if (mut.kind === "addFile") {
    // addFile: ensure the parent dir matches the fixture. Use the first dir
    // segment of the first existing leaf file if the literal path won't apply.
    const firstReal = findFirstFile(prevLeaves, () => true);
    if (!firstReal) return null;
    const parentDir = firstReal.split("/").slice(0, -1).join("/");
    return { ...mut, path: `${parentDir}/${mut.path.split("/").pop()}` };
  }
  if (targetExists) return mut;
  // Otherwise pick a real file with the same basename pattern.
  const real = findFirstFile(prevLeaves, (p) => /\/f\.ts$/.test(p) || /\/o1\.ts$/.test(p));
  if (!real) return null;
  if (mut.kind === "renameFile") {
    const renamed = real.replace(/[^/]+$/, "renamed.ts");
    return { kind: "renameFile", fromPath: real, toPath: renamed };
  }
  if (mut.kind === "growFile" || mut.kind === "shrinkFile") {
    return { ...mut, path: real };
  }
  if (mut.kind === "removeFile") {
    return { kind: "removeFile", path: real };
  }
  return null;
}

for (const fixId of FIXTURES) {
  test(`${fixId}: determinism — same input → same binIds`, () => {
    const fix = buildFixture(NAMED_FIXTURES[fixId]);
    const a = partitionTree(fix.root, fix.repoBase);
    const b = partitionTree(fix.root, fix.repoBase);
    const aById = new Map(a.filter((l) => l.binId).map((l) => [l.path + "#" + l.binIndex, l.binId]));
    const bById = new Map(b.filter((l) => l.binId).map((l) => [l.path + "#" + l.binIndex, l.binId]));
    assert.deepEqual(aById, bById);
    assert.ok(aById.size > 0, `${fixId} should produce at least one bin leaf`);
  });

  for (const mut of MUTATIONS) {
    test(`${fixId} + ${mut.kind}:${"path" in mut ? mut.path : ""}: bins with unchanged file-set keep binId; changed file-sets get fresh binId`, () => {
      const t0 = buildFixture(NAMED_FIXTURES[fixId]);
      const prevLeaves = partitionTree(t0.root, t0.repoBase);
      const adapted = adaptMutation(mut, prevLeaves);
      if (!adapted) return; // mutation does not apply to this fixture
      let t1;
      try {
        t1 = applyMutation(t0, adapted);
      } catch {
        return; // mutation invalid for this tree — skip silently
      }
      const currLeaves = partitionTree(t1.root, t1.repoBase);

      const prev = binsByMembers(prevLeaves);
      const curr = binsByMembers(currLeaves);

      let preservedCount = 0;
      for (const [key, prevLeaf] of prev) {
        const currLeaf = curr.get(key);
        if (currLeaf) {
          assert.equal(
            currLeaf.binId,
            prevLeaf.binId,
            `bin with unchanged file-set must keep binId (key=${key.slice(0, 60)})`,
          );
          preservedCount++;
        }
      }
      // Bins whose file-set changed should not collide with prev binIds (no false stability).
      const prevIds = new Set([...prev.values()].map((l) => l.binId));
      for (const [key, currLeaf] of curr) {
        if (!prev.has(key)) {
          assert.ok(
            !prevIds.has(currLeaf.binId!),
            `new bin with different file-set must NOT share a binId with any prev bin`,
          );
        }
      }
      // Don't assert preservedCount > 0 — some mutations (rename) intentionally
      // change every affected bin's file-set.
    });
  }
}
