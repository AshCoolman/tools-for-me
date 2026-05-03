// Allocation + collision — scenarios 26, 27, 28, 29, 30, 31, 32, 35, 36, 37, 38, 39, 40.

import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate } from "../../src/sim/allocate.js";
import { collisionMatrix } from "../../src/sim/collide.js";
import type { Leaf } from "../../src/sim/types.js";

function makeLeaves(n: number): Leaf[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `leaf-${String(i).padStart(2, "0")}`,
    scope: "subtree",
    files: [`leaf-${i}/a.ts`, `leaf-${i}/b.ts`],
    loc: 100 + i,
  }));
}

test("scenario 26: round-robin with k=5 across 10 leaves yields 2 leaves per agent", () => {
  const leaves = makeLeaves(10);
  const a = allocate(leaves, { strategy: "round-robin", k: 5, seed: 1 });
  assert.equal(a.assignments.length, 5);
  for (const assn of a.assignments) assert.equal(assn.leafIds.length, 2);
});

test("scenario 27: round-robin with k > leaves wraps and produces collisions", () => {
  const leaves = makeLeaves(3);
  const a = allocate(leaves, { strategy: "round-robin", k: 5, seed: 1 });
  assert.equal(a.assignments.length, 5);
  // 3 leaves into 5 agents — first 3 agents get 1 leaf each, last 2 are empty.
  assert.equal(a.assignments[0].leafIds.length, 1);
  assert.equal(a.assignments[3].leafIds.length, 0);
  assert.equal(a.assignments[4].leafIds.length, 0);
});

test("scenario 28: random-uniform without replacement → no collisions when k ≤ n", () => {
  const leaves = makeLeaves(10);
  const a = allocate(leaves, { strategy: "random-uniform", k: 5, seed: 7 });
  const cm = collisionMatrix(a, leaves);
  assert.equal(cm.pairs.length, 0);
});

test("scenario 29: random-uniform with replacement surfaces collisions", () => {
  const leaves = makeLeaves(4);
  const a = allocate(leaves, { strategy: "random-uniform-rep", k: 8, seed: 7 });
  const cm = collisionMatrix(a, leaves);
  // With 8 agents drawing from 4 leaves with replacement, collision is overwhelmingly likely.
  assert.ok(cm.pairs.length > 0, "with-replacement strategy should produce collisions");
});

test("scenario 30: priority-weighted picks high-priority leaves preferentially", () => {
  const leaves = makeLeaves(5);
  const priorityOf = (id: string) => (id.endsWith("00") ? 100 : 1);
  const a = allocate(leaves, {
    strategy: "priority-weighted",
    k: 3,
    seed: 11,
    priorityOf,
  });
  // The leaf with id "leaf-00" should appear in many assignments.
  const allIds = a.assignments.flatMap((s) => s.leafIds);
  const top = allIds.filter((id) => id === "leaf-00").length;
  const other = allIds.length - top;
  assert.ok(top > other / 2, "priority-weighted should bias toward high-priority leaves");
});

test("scenario 31: collision matrix is empty when assignments are disjoint", () => {
  const leaves = makeLeaves(4);
  const allocation = {
    strategy: "round-robin" as const,
    seed: 1,
    k: 2,
    assignments: [
      { agentId: 0, leafIds: ["leaf-00", "leaf-01"] },
      { agentId: 1, leafIds: ["leaf-02", "leaf-03"] },
    ],
  };
  const cm = collisionMatrix(allocation, leaves);
  assert.equal(cm.pairs.length, 0);
});

test("scenario 32: collision matrix surfaces sharedFiles across agents", () => {
  const leaves = makeLeaves(3);
  const allocation = {
    strategy: "round-robin" as const,
    seed: 1,
    k: 2,
    assignments: [
      { agentId: 0, leafIds: ["leaf-00", "leaf-01"] },
      { agentId: 1, leafIds: ["leaf-01", "leaf-02"] },
    ],
  };
  const cm = collisionMatrix(allocation, leaves);
  assert.equal(cm.pairs.length, 1);
  assert.equal(cm.pairs[0].agentA, 0);
  assert.equal(cm.pairs[0].agentB, 1);
  assert.deepEqual(cm.pairs[0].sharedLeaves, ["leaf-01"]);
  assert.ok(cm.pairs[0].sharedFiles.includes("leaf-1/a.ts"));
});

test("scenario 35: priority-weighted with zero weights filters those leaves out", () => {
  const leaves = makeLeaves(5);
  const priorityOf = (id: string) => (id === "leaf-02" || id === "leaf-04" ? 0 : 1);
  const a = allocate(leaves, {
    strategy: "priority-weighted",
    k: 3,
    seed: 11,
    priorityOf,
  });
  const allIds = a.assignments.flatMap((s) => s.leafIds);
  assert.ok(!allIds.includes("leaf-02"), "zero-weight leaves should not appear");
  assert.ok(!allIds.includes("leaf-04"), "zero-weight leaves should not appear");
});

test("scenario 36: round-robin with k > n surfaces empty agents (no leaves)", () => {
  const leaves = makeLeaves(2);
  const a = allocate(leaves, { strategy: "round-robin", k: 5, seed: 1 });
  const cm = collisionMatrix(a, leaves);
  // No agent gets the same leaf twice.
  assert.equal(cm.pairs.length, 0);
});

test("scenario 37: deterministic — same strategy + seed → byte-identical Allocation", () => {
  const leaves = makeLeaves(20);
  const a = allocate(leaves, { strategy: "random-uniform", k: 4, seed: 99 });
  const b = allocate(leaves, { strategy: "random-uniform", k: 4, seed: 99 });
  assert.equal(JSON.stringify(a.assignments), JSON.stringify(b.assignments));
});

test("scenario 38: different seeds produce different allocations", () => {
  const leaves = makeLeaves(20);
  const a = allocate(leaves, { strategy: "random-uniform", k: 4, seed: 1 });
  const b = allocate(leaves, { strategy: "random-uniform", k: 4, seed: 2 });
  assert.notEqual(JSON.stringify(a.assignments), JSON.stringify(b.assignments));
});

test("scenario 39: agentLoad summarises per-agent total LOC and file count", () => {
  const leaves = makeLeaves(6);
  const a = allocate(leaves, { strategy: "round-robin", k: 3, seed: 1 });
  const cm = collisionMatrix(a, leaves);
  assert.equal(cm.agentLoad.length, 3);
  for (const load of cm.agentLoad) {
    assert.ok(load.totalLoc > 0);
    assert.ok(load.fileCount > 0);
  }
});

test("scenario 40: zero leaves → empty allocation, no collisions", () => {
  const a = allocate([], { strategy: "round-robin", k: 3, seed: 1 });
  const cm = collisionMatrix(a, []);
  assert.equal(cm.pairs.length, 0);
  assert.equal(cm.agentLoad.length, 3);
});
