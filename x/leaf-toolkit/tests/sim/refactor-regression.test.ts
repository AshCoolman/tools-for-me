// Refactor regression test (FR-002, FR-013, scenarios 89-92).
//
// Anchors: tests/sim/__snapshots__/leaves.gitignored.json (captured by
// _generate.mts against tests/sim/__fixtures__/host-src-snapshot/).
//
// The frozen fixture is a copy of `src/` taken at the start of the simulator
// build, so this test continues to be meaningful as the live `src/` evolves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFromFs } from "../../src/sim/core/dirnode.js";
import { partitionTree, TARGET_LOC, SPLIT_AT } from "../../src/sim/core/partition-core.js";

const SNAPSHOT_PATH = resolve(import.meta.dirname, "__snapshots__/leaves.gitignored.json");
const FIXTURE_ROOT = resolve(import.meta.dirname, "__fixtures__/host-src-snapshot");
const REPO_BASE = resolve(FIXTURE_ROOT, "..");

const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));

test("partitionTree on frozen src/ matches snapshot leaves[]", () => {
  const root = buildFromFs(FIXTURE_ROOT);
  const leaves = partitionTree(root, REPO_BASE);

  assert.equal(leaves.length, snapshot.leaves.length, "leaf count");
  for (let i = 0; i < leaves.length; i++) {
    const live = leaves[i];
    const snap = snapshot.leaves[i];
    assert.equal(live.path, snap.path, `leaf ${i} path`);
    assert.equal(live.scope, snap.scope, `leaf ${i} scope`);
    assert.equal(live.binIndex, snap.binIndex, `leaf ${i} binIndex`);
    assert.equal(live.binTotal, snap.binTotal, `leaf ${i} binTotal`);
    assert.equal(live.binId, snap.binId, `leaf ${i} binId`);
    assert.deepEqual(live.members, snap.members, `leaf ${i} members`);
    assert.deepEqual(live.files, snap.files, `leaf ${i} files`);
    assert.equal(live.loc, snap.loc, `leaf ${i} loc`);
  }
});

test("snapshot manifest header reflects partition core constants", () => {
  assert.equal(snapshot.targetLoc, TARGET_LOC);
  assert.equal(snapshot.splitAt, SPLIT_AT);
  assert.equal(
    snapshot.totalLoc,
    snapshot.leaves.reduce((a: number, l: { loc: number }) => a + l.loc, 0),
  );
  assert.equal(
    snapshot.totalFiles,
    snapshot.leaves.reduce((a: number, l: { files: string[] }) => a + l.files.length, 0),
  );
});

test("buildFromFs walks frozen tree deterministically (re-entrancy)", () => {
  const a = buildFromFs(FIXTURE_ROOT);
  const b = buildFromFs(FIXTURE_ROOT);
  // Compare structural shape (paths + LOC), not object identity.
  assert.equal(a.subtreeLoc, b.subtreeLoc);
  assert.equal(a.allFiles.length, b.allFiles.length);
  for (let i = 0; i < a.allFiles.length; i++) {
    assert.equal(a.allFiles[i].path, b.allFiles[i].path);
    assert.equal(a.allFiles[i].loc, b.allFiles[i].loc);
  }
});
