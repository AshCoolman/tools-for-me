// Pathological inputs — scenarios 95, 96, 97, 98, 99.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFromMock } from "../../src/sim/core/dirnode.js";
import { partitionTree } from "../../src/sim/core/partition-core.js";
import { checkOverlap } from "../../src/sim/overlap.js";
import { report } from "../../src/sim/report.js";
import type { FixtureBuild } from "../../src/sim/types.js";

function fixtureFromRoot(repoBase: string, root: ReturnType<typeof buildFromMock>): FixtureBuild {
  return {
    spec: { id: "patho", seed: 0, shape: "custom", params: {} },
    repoBase,
    root,
  };
}

test("scenario 95: deeply-nested single file does not crash partition", () => {
  // Build /mock/a/b/c/d/e/f/g.ts at depth 7.
  const root = buildFromMock("/mock", { a: { b: { c: { d: { e: { f: { "g.ts": { loc: 50 } } } } } } } });
  const leaves = partitionTree(root, "/mock");
  assert.equal(leaves.length, 1);
});

test("scenario 96: huge file in tiny tree still produces a single leaf", () => {
  const root = buildFromMock("/mock", { "huge.ts": { loc: 50_000 } });
  const leaves = partitionTree(root, "/mock");
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].loc, 50_000);
  // No overlap regardless of size.
  assert.equal(checkOverlap(leaves).overlapCount, 0);
});

test("scenario 97: thousands of small files — partition is still pure and deterministic", () => {
  const desc: Record<string, { loc: number }> = {};
  for (let i = 0; i < 2000; i++) desc[`f${i}.ts`] = { loc: 1 };
  const root = buildFromMock("/mock", desc);
  const leaves1 = partitionTree(root, "/mock");
  const leaves2 = partitionTree(root, "/mock");
  assert.equal(JSON.stringify(leaves1), JSON.stringify(leaves2));
  // Sum of leaves' loc equals tree subtreeLoc.
  const sum = leaves1.reduce((a, l) => a + l.loc, 0);
  assert.equal(sum, root.subtreeLoc);
});

test("scenario 98: zero-LOC files do not break overlap or partition", () => {
  const root = buildFromMock("/mock", { "a.ts": { loc: 0 }, "b.ts": { loc: 0 }, "c.ts": { loc: 100 } });
  const leaves = partitionTree(root, "/mock");
  // subtreeLoc is 100, fits in one leaf.
  assert.equal(leaves.length, 1);
  assert.equal(checkOverlap(leaves).overlapCount, 0);
});

test("scenario 99: report runs end-to-end on a pathological fixture without throwing", () => {
  const root = buildFromMock("/mock", {
    deeply: { nested: { tree: { with: { a: { single: { "leaf.ts": { loc: 50 } } } } } } },
  });
  const f = fixtureFromRoot("/mock", root);
  const r = report({
    fixture: f,
    allocation: { strategy: "round-robin", k: 4, seed: 1 },
  });
  assert.ok(r.summary === "clean" || r.summary.startsWith("violations:"));
  assert.equal(r.runs.length, 1);
});
