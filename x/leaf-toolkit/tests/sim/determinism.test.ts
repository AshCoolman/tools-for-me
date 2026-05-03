// Determinism — scenarios 83, 84, 85, 86, 87, 88. Every report run with the
// same (fixture, seed, mutation, allocation) tuple MUST produce byte-identical
// output (excluding the timestamp, which is fixed to 'DETERMINISTIC' for sim).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, NAMED_FIXTURES } from "../../src/sim/fixtures.js";
import { partitionTree } from "../../src/sim/core/partition-core.js";
import { applyMutation } from "../../src/sim/mutations.js";
import { allocate } from "../../src/sim/allocate.js";
import { renderAscii } from "../../src/sim/visualise.js";
import { balanceMetrics } from "../../src/sim/balance.js";
import { report } from "../../src/sim/report.js";

test("scenario 83: partitionTree is deterministic for same input", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const a = partitionTree(f.root, f.repoBase);
  const b = partitionTree(f.root, f.repoBase);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("scenario 84: applyMutation is deterministic for same mutation", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const a = applyMutation(f, { kind: "addFile", path: "x.ts", loc: 100 });
  const b = applyMutation(f, { kind: "addFile", path: "x.ts", loc: 100 });
  assert.equal(JSON.stringify(a.root), JSON.stringify(b.root));
});

test("scenario 85: allocate is deterministic for same seed", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const a = allocate(leaves, { strategy: "random-uniform", k: 4, seed: 13 });
  const b = allocate(leaves, { strategy: "random-uniform", k: 4, seed: 13 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("scenario 86: renderAscii is deterministic", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const a = renderAscii(f.root, leaves);
  const b = renderAscii(f.root, leaves);
  assert.equal(a, b);
});

test("scenario 87: balanceMetrics is deterministic", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const a = balanceMetrics(leaves);
  const b = balanceMetrics(leaves);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("scenario 88: full SimReport is byte-identical across two runs", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const a = report({
    fixture: f,
    mutation: { kind: "addFile", path: "x.ts", loc: 50 },
    allocation: { strategy: "random-uniform", k: 4, seed: 13 },
  });
  const b = report({
    fixture: f,
    mutation: { kind: "addFile", path: "x.ts", loc: 50 },
    allocation: { strategy: "random-uniform", k: 4, seed: 13 },
  });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
