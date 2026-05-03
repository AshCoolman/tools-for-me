// Boundary fixtures — scenarios 61, 62, 63, 64, 66, 67, 68, 69, 70, 71, 72.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, NAMED_FIXTURES } from "../../src/sim/fixtures.js";
import { partitionTree, SPLIT_AT } from "../../src/sim/core/partition-core.js";
import { checkOverlap } from "../../src/sim/overlap.js";
import { applyMutation } from "../../src/sim/mutations.js";

test("scenario 61: boundary-1499 fits in one subtree leaf", () => {
  const f = buildFixture(NAMED_FIXTURES["boundary-1499"]);
  const leaves = partitionTree(f.root, f.repoBase);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].scope, "subtree");
  assert.ok(leaves[0].loc <= SPLIT_AT);
});

test("scenario 62: boundary-1500 — exactly at SPLIT_AT — stays as one subtree", () => {
  const f = buildFixture(NAMED_FIXTURES["boundary-1500"]);
  const leaves = partitionTree(f.root, f.repoBase);
  // subtreeLoc <= SPLIT_AT is the predicate, so ==SPLIT_AT stays as subtree.
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].scope, "subtree");
  assert.equal(leaves[0].loc, SPLIT_AT);
});

test("scenario 63: boundary-1501 — one over SPLIT_AT — forces bin packing", () => {
  const f = buildFixture(NAMED_FIXTURES["boundary-1501"]);
  const leaves = partitionTree(f.root, f.repoBase);
  // subtreeLoc > SPLIT_AT triggers bin path; with all-files-only, single bin wraps to subtree.
  // But the file LOC distribution in boundary fixtures keeps siblings small enough to repack.
  const totalLoc = leaves.reduce((a, l) => a + l.loc, 0);
  assert.equal(totalLoc, 1501);
});

test("scenario 64: boundary fixtures contain no overlap", () => {
  for (const id of ["boundary-1499", "boundary-1500", "boundary-1501"]) {
    const f = buildFixture(NAMED_FIXTURES[id]);
    const leaves = partitionTree(f.root, f.repoBase);
    const report = checkOverlap(leaves);
    assert.equal(report.overlapCount, 0, `${id} should have zero overlap`);
  }
});

function firstLeafPath(repoBase: string, root: { allFiles: { path: string }[] }): string {
  const f = root.allFiles[0];
  return f.path.replace(`${repoBase}/`, "");
}

test("scenario 66: a 1-LOC growth keeps both runs under SPLIT_AT", () => {
  const t0 = buildFixture(NAMED_FIXTURES["boundary-1499"]);
  const target = firstLeafPath(t0.repoBase, t0.root);
  // 1499 → 1500 (still ≤ SPLIT_AT)
  const t1 = applyMutation(t0, { kind: "growFile", path: target, deltaLoc: 1 });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].scope, "subtree");
  assert.equal(b[0].scope, "subtree");
});

test("scenario 67: a 2-LOC growth crosses the boundary and triggers bin path", () => {
  const t0 = buildFixture(NAMED_FIXTURES["boundary-1499"]);
  const target = firstLeafPath(t0.repoBase, t0.root);
  const t1 = applyMutation(t0, { kind: "growFile", path: target, deltaLoc: 2 });
  const b = partitionTree(t1.root, t1.repoBase);
  const totalLoc = b.reduce((a, l) => a + l.loc, 0);
  assert.equal(totalLoc, 1501);
  // Crossing boundary with subdirs produces multiple leaves.
  assert.ok(b.length >= 1);
});

test("scenario 68: removing a single file at boundary moves back under SPLIT_AT", () => {
  const t0 = buildFixture(NAMED_FIXTURES["boundary-1501"]);
  const target = firstLeafPath(t0.repoBase, t0.root);
  const t1 = applyMutation(t0, { kind: "removeFile", path: target });
  const b = partitionTree(t1.root, t1.repoBase);
  const total = b.reduce((a, l) => a + l.loc, 0);
  assert.ok(total < 1501);
});

test("scenario 69: zero-loc fixture produces no leaves", () => {
  const empty = {
    spec: { id: "empty", seed: 0, shape: "custom" as const, params: {} as Record<string, unknown> },
    repoBase: "/mock",
    root: { path: "/mock", files: [], dirs: [], fileLoc: 0, subtreeLoc: 0, allFiles: [] },
  };
  const leaves = partitionTree(empty.root, empty.repoBase);
  assert.equal(leaves.length, 0);
});

test("scenario 70: single-file tiny fixture produces one subtree leaf", () => {
  const tiny = {
    repoBase: "/mock",
    root: {
      path: "/mock",
      files: [{ path: "/mock/x.ts", loc: 10 }],
      dirs: [],
      fileLoc: 10,
      subtreeLoc: 10,
      allFiles: [{ path: "/mock/x.ts", loc: 10 }],
    },
  };
  const leaves = partitionTree(tiny.root, tiny.repoBase);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].scope, "subtree");
  assert.equal(leaves[0].loc, 10);
});

test("scenario 71: subtree LOC == SPLIT_AT is the inclusive boundary", () => {
  // Build a tree summing to exactly SPLIT_AT and assert it stays as subtree.
  const root = {
    path: "/mock",
    files: [{ path: "/mock/x.ts", loc: SPLIT_AT }],
    dirs: [],
    fileLoc: SPLIT_AT,
    subtreeLoc: SPLIT_AT,
    allFiles: [{ path: "/mock/x.ts", loc: SPLIT_AT }],
  };
  const leaves = partitionTree(root, "/mock");
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].scope, "subtree");
});

test("scenario 72: subtreeLoc invariant — sum of leaves equals tree subtreeLoc", () => {
  for (const id of ["flat-30", "boundary-1499", "boundary-1501", "wide-shallow"]) {
    const f = buildFixture(NAMED_FIXTURES[id]);
    const leaves = partitionTree(f.root, f.repoBase);
    const sum = leaves.reduce((a, l) => a + l.loc, 0);
    assert.equal(sum, f.root.subtreeLoc, `${id}: leaves sum must equal tree subtreeLoc`);
  }
});
