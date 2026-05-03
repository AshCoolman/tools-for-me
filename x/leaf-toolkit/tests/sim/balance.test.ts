// Balance metrics — scenarios 51, 52, 53, 54, 55, 57, 58, 59.

import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceMetrics } from "../../src/sim/balance.js";
import type { Leaf } from "../../src/sim/types.js";

function makeLeavesUniform(n: number, loc: number): Leaf[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `leaf-${i}`,
    scope: "subtree",
    files: [`leaf-${i}/a.ts`],
    loc,
  }));
}

test("scenario 51: uniform leaves → well-balanced verdict", () => {
  const r = balanceMetrics(makeLeavesUniform(10, 100));
  assert.equal(r.verdict, "well-balanced");
  assert.equal(r.loc.maxOverMin, 1);
});

test("scenario 52: 3× outlier → unbalanced verdict", () => {
  const leaves = [
    { path: "a", scope: "subtree" as const, files: ["a/x.ts"], loc: 100 },
    { path: "b", scope: "subtree" as const, files: ["b/x.ts"], loc: 100 },
    { path: "c", scope: "subtree" as const, files: ["c/x.ts"], loc: 400 }, // 4× over min
  ];
  const r = balanceMetrics(leaves);
  assert.equal(r.verdict, "unbalanced");
  assert.equal(r.loc.maxOverMin, 4);
});

test("scenario 53: max/min ratio between 1.5 and 3 → skewed verdict", () => {
  const leaves = [
    { path: "a", scope: "subtree" as const, files: ["a/x.ts"], loc: 100 },
    { path: "b", scope: "subtree" as const, files: ["b/x.ts"], loc: 200 }, // 2× over min
  ];
  const r = balanceMetrics(leaves);
  assert.equal(r.verdict, "skewed");
});

test("scenario 54: single leaf → verdict 'n/a'", () => {
  const r = balanceMetrics(makeLeavesUniform(1, 500));
  assert.equal(r.verdict, "n/a");
});

test("scenario 55: empty leaves → verdict 'n/a' and zeros", () => {
  const r = balanceMetrics([]);
  assert.equal(r.verdict, "n/a");
  assert.equal(r.totalLoc, 0);
  assert.equal(r.totalFiles, 0);
});

test("scenario 57: stats include mean, stddev, min, max", () => {
  const r = balanceMetrics(makeLeavesUniform(4, 100));
  assert.equal(r.loc.mean, 100);
  assert.equal(r.loc.stddev, 0);
  assert.equal(r.loc.min, 100);
  assert.equal(r.loc.max, 100);
});

test("scenario 58: maxOverMin is null when min is zero", () => {
  const leaves = [
    { path: "a", scope: "subtree" as const, files: [], loc: 0 },
    { path: "b", scope: "subtree" as const, files: ["b/x.ts"], loc: 100 },
  ];
  const r = balanceMetrics(leaves);
  assert.equal(r.loc.maxOverMin, null);
});

test("scenario 59: file-count stats run alongside LOC stats", () => {
  const leaves = [
    { path: "a", scope: "subtree" as const, files: ["a/1.ts", "a/2.ts"], loc: 100 },
    { path: "b", scope: "subtree" as const, files: ["b/1.ts"], loc: 100 },
  ];
  const r = balanceMetrics(leaves);
  assert.equal(r.files.min, 1);
  assert.equal(r.files.max, 2);
  assert.equal(r.files.maxOverMin, 2);
});
