// Mutations — scenarios 73, 74, 75, 76, 77, 78, 79, 80, 81, 82.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, NAMED_FIXTURES, DEFAULT_REPO_BASE } from "../../src/sim/fixtures.js";
import { applyMutation } from "../../src/sim/mutations.js";

test("scenario 73: addFile increases subtreeLoc and adds to allFiles", () => {
  const before = buildFixture(NAMED_FIXTURES["flat-30"]);
  const beforeLoc = before.root.subtreeLoc;
  const beforeCount = before.root.allFiles.length;
  const after = applyMutation(before, { kind: "addFile", path: "new.ts", loc: 100 });
  assert.equal(after.root.subtreeLoc, beforeLoc + 100);
  assert.equal(after.root.allFiles.length, beforeCount + 1);
  // Original is untouched.
  assert.equal(before.root.subtreeLoc, beforeLoc);
  assert.equal(before.root.allFiles.length, beforeCount);
});

test("scenario 74: removeFile decreases subtreeLoc by exactly the file's loc", () => {
  const before = buildFixture(NAMED_FIXTURES["flat-30"]);
  const target = before.root.files[0];
  const targetLoc = target.loc;
  const targetName = target.path.split("/").pop()!;
  const after = applyMutation(before, { kind: "removeFile", path: targetName });
  assert.equal(after.root.subtreeLoc, before.root.subtreeLoc - targetLoc);
  assert.ok(!after.root.files.some((f) => f.path === target.path));
});

test("scenario 75: growFile delta propagates up the tree", () => {
  const spec = NAMED_FIXTURES["deep-narrow"];
  const before = buildFixture(spec);
  // Find a file deep in the tree.
  let cur = before.root;
  while (cur.dirs.length > 0) cur = cur.dirs[0];
  const file = cur.files[0];
  assert.ok(file, "deep-narrow should have files at deepest level");
  const path = file.path.replace(`${DEFAULT_REPO_BASE}/`, "");
  const after = applyMutation(before, { kind: "growFile", path, deltaLoc: 50 });
  assert.equal(after.root.subtreeLoc, before.root.subtreeLoc + 50);
});

test("scenario 76: shrinkFile clamps at zero", () => {
  const before = buildFixture(NAMED_FIXTURES["flat-30"]);
  const target = before.root.files[0];
  const targetName = target.path.split("/").pop()!;
  const after = applyMutation(before, {
    kind: "shrinkFile",
    path: targetName,
    deltaLoc: target.loc + 1000,
  });
  const newFile = after.root.files.find((f) => f.path === target.path)!;
  assert.equal(newFile.loc, 0);
});

test("scenario 77: renameFile preserves loc and tree integrity", () => {
  const before = buildFixture(NAMED_FIXTURES["flat-30"]);
  const target = before.root.files[0];
  const targetLoc = target.loc;
  const fromName = target.path.split("/").pop()!;
  const after = applyMutation(before, {
    kind: "renameFile",
    fromPath: fromName,
    toPath: "renamed.ts",
  });
  assert.equal(after.root.subtreeLoc, before.root.subtreeLoc);
  const renamed = after.root.files.find((f) => f.path.endsWith("/renamed.ts"));
  assert.ok(renamed, "renamed file should exist");
  assert.equal(renamed!.loc, targetLoc);
  assert.ok(!after.root.files.some((f) => f.path === target.path));
});

test("scenario 78: moveFile moves to a new directory and preserves loc", () => {
  const before = buildFixture(NAMED_FIXTURES["flat-30"]);
  const target = before.root.files[0];
  const fromName = target.path.split("/").pop()!;
  const after = applyMutation(before, { kind: "moveFile", path: fromName, toDir: "subdir" });
  assert.equal(after.root.subtreeLoc, before.root.subtreeLoc);
  const subdir = after.root.dirs.find((d) => d.path.endsWith("/subdir"));
  assert.ok(subdir, "subdir should be created");
  assert.equal(subdir!.files.length, 1);
  assert.equal(subdir!.files[0].loc, target.loc);
});

test("scenario 79: addDir creates an empty directory without changing loc", () => {
  const before = buildFixture(NAMED_FIXTURES["flat-30"]);
  const after = applyMutation(before, { kind: "addDir", path: "empty" });
  assert.equal(after.root.subtreeLoc, before.root.subtreeLoc);
  // Empty dir has no impact on subtreeLoc; it may or may not show in dirs[]
  // depending on whether subsequent files land in it. Our implementation
  // creates it eagerly:
  const created = after.root.dirs.find((d) => d.path.endsWith("/empty"));
  assert.ok(created);
});

test("scenario 80: removeDir removes the subtree and recomputes loc", () => {
  const before = buildFixture(NAMED_FIXTURES["wide-shallow"]);
  const targetDir = before.root.dirs[0];
  const targetLoc = targetDir.subtreeLoc;
  const targetName = targetDir.path.split("/").pop()!;
  const after = applyMutation(before, { kind: "removeDir", path: targetName });
  assert.equal(after.root.subtreeLoc, before.root.subtreeLoc - targetLoc);
  assert.ok(!after.root.dirs.some((d) => d.path === targetDir.path));
});

test("scenario 81: mutations are immutable — input FixtureBuild unchanged", () => {
  const before = buildFixture(NAMED_FIXTURES["flat-30"]);
  const beforeLoc = before.root.subtreeLoc;
  const beforeCount = before.root.allFiles.length;
  applyMutation(before, { kind: "addFile", path: "x.ts", loc: 999 });
  applyMutation(before, { kind: "removeFile", path: before.root.files[0].path.split("/").pop()! });
  assert.equal(before.root.subtreeLoc, beforeLoc);
  assert.equal(before.root.allFiles.length, beforeCount);
});

test("scenario 82: chained mutations recompute aggregates correctly", () => {
  const t0 = buildFixture(NAMED_FIXTURES["flat-30"]);
  const t1 = applyMutation(t0, { kind: "addFile", path: "a.ts", loc: 100 });
  const t2 = applyMutation(t1, { kind: "addFile", path: "b.ts", loc: 200 });
  const t3 = applyMutation(t2, { kind: "growFile", path: "a.ts", deltaLoc: 50 });
  assert.equal(t3.root.subtreeLoc, t0.root.subtreeLoc + 100 + 200 + 50);
});
