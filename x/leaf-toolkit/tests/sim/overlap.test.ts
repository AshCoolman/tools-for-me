// US1 — overlap detection. Scenarios 1, 2, 3, 4, 5, 6, 7, 10, 12.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, NAMED_FIXTURES } from "../../src/sim/fixtures.js";
import { partitionTree } from "../../src/sim/core/partition-core.js";
import { checkOverlap } from "../../src/sim/overlap.js";
import type { Leaf } from "../../src/sim/types.js";

test("scenario 1: flat-30 fixture partitions with zero overlap", () => {
  const fixture = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(fixture.root, fixture.repoBase);
  const report = checkOverlap(leaves);
  assert.equal(report.overlapCount, 0);
  assert.deepEqual(report.overlaps, []);
  assert.deepEqual(report.intraLeafDuplicates, []);
});

test("scenario 2: wide-shallow forces bin scope without overlap", () => {
  const fixture = buildFixture(NAMED_FIXTURES["wide-shallow"]);
  const leaves = partitionTree(fixture.root, fixture.repoBase);
  const hasBinLeaf = leaves.some((l) => l.scope === "bin");
  assert.ok(hasBinLeaf, "wide-shallow should produce at least one bin leaf");
  const report = checkOverlap(leaves);
  assert.equal(report.overlapCount, 0);
});

test("scenario 3: synthetic broken partition surfaces overlap with leaf names", () => {
  const broken: Leaf[] = [
    { path: "a", scope: "subtree", files: ["a/x.ts", "a/y.ts"], loc: 50 },
    { path: "b", scope: "subtree", files: ["a/x.ts", "b/z.ts"], loc: 40 },
  ];
  const report = checkOverlap(broken);
  assert.equal(report.overlapCount, 1);
  assert.equal(report.overlaps[0].file, "a/x.ts");
  assert.deepEqual(report.overlaps[0].leaves, ["a", "b"]);
});

test("scenario 4: empty leaves array reports zero overlap affirmatively", () => {
  const report = checkOverlap([]);
  assert.equal(report.overlapCount, 0);
  assert.deepEqual(report.overlaps, []);
  assert.deepEqual(report.intraLeafDuplicates, []);
});

test("scenario 5: single leaf with one file is clean", () => {
  const leaves: Leaf[] = [{ path: "a", scope: "subtree", files: ["a/x.ts"], loc: 10 }];
  const report = checkOverlap(leaves);
  assert.equal(report.overlapCount, 0);
});

test("scenario 6: report is affirmative even when leaves cover many files", () => {
  const leaves: Leaf[] = [
    { path: "a", scope: "subtree", files: Array.from({ length: 50 }, (_, i) => `a/f${i}.ts`), loc: 500 },
    { path: "b", scope: "subtree", files: Array.from({ length: 30 }, (_, i) => `b/f${i}.ts`), loc: 300 },
  ];
  const report = checkOverlap(leaves);
  assert.equal(report.overlapCount, 0);
  // Affirmative: an empty overlaps[] and a numeric 0 distinguishable from "didn't run".
  assert.ok(Array.isArray(report.overlaps));
});

test("scenario 7: intra-leaf duplicates are surfaced separately", () => {
  const leaves: Leaf[] = [
    { path: "a", scope: "subtree", files: ["a/x.ts", "a/x.ts", "a/y.ts"], loc: 30 },
  ];
  const report = checkOverlap(leaves);
  assert.equal(report.intraLeafDuplicates.length, 1);
  assert.equal(report.intraLeafDuplicates[0].leaf, "a");
  assert.equal(report.intraLeafDuplicates[0].file, "a/x.ts");
});

test("scenario 10: multi-leaf overlap names every offending leaf", () => {
  const leaves: Leaf[] = [
    { path: "a", scope: "subtree", files: ["shared.ts"], loc: 10 },
    { path: "b", scope: "subtree", files: ["shared.ts"], loc: 10 },
    { path: "c", scope: "subtree", files: ["shared.ts"], loc: 10 },
  ];
  const report = checkOverlap(leaves);
  assert.equal(report.overlapCount, 1);
  assert.deepEqual(report.overlaps[0].leaves, ["a", "b", "c"]);
});

test("scenario 12: bin leaves are identified by 'path#binId' in overlap reports", () => {
  const leaves: Leaf[] = [
    { path: "a", scope: "bin", binIndex: 1, binTotal: 2, binId: "aaa111", files: ["dup.ts"], loc: 10 },
    { path: "a", scope: "bin", binIndex: 2, binTotal: 2, binId: "bbb222", files: ["dup.ts"], loc: 10 },
  ];
  const report = checkOverlap(leaves);
  assert.equal(report.overlapCount, 1);
  assert.deepEqual(report.overlaps[0].leaves, ["a#aaa111", "a#bbb222"]);
});
