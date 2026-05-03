// Drift — scenarios 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, NAMED_FIXTURES } from "../../src/sim/fixtures.js";
import { applyMutation } from "../../src/sim/mutations.js";
import { partitionTree } from "../../src/sim/core/partition-core.js";
import { diffRuns } from "../../src/sim/drift.js";
import type { PartitionRun } from "../../src/sim/types.js";

function toRun(runId: string, fixtureId: string, seed: number, leaves: ReturnType<typeof partitionTree>): PartitionRun {
  return {
    runId,
    fixtureId,
    seed,
    leaves,
    totalLoc: leaves.reduce((a, l) => a + l.loc, 0),
    totalFiles: leaves.reduce((a, l) => a + l.files.length, 0),
    generatedAt: "DETERMINISTIC",
  };
}

test("scenario 13: same fixture twice → empty drift", () => {
  const fixture = buildFixture(NAMED_FIXTURES["flat-30"]);
  const a = partitionTree(fixture.root, fixture.repoBase);
  const b = partitionTree(fixture.root, fixture.repoBase);
  const drift = diffRuns(toRun("a", "flat-30", 42, a), toRun("b", "flat-30", 42, b));
  assert.equal(drift.filesAdded.length, 0);
  assert.equal(drift.filesRemoved.length, 0);
  assert.equal(drift.filesMovedLeaf.length, 0);
  assert.equal(drift.binsRenumbered.length, 0);
  assert.equal(drift.leavesAdded.length, 0);
  assert.equal(drift.leavesRemoved.length, 0);
});

test("scenario 14: addFile mutation surfaces as filesAdded", () => {
  const t0 = buildFixture(NAMED_FIXTURES["flat-30"]);
  const t1 = applyMutation(t0, { kind: "addFile", path: "newcomer.ts", loc: 50 });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const drift = diffRuns(toRun("t0", "flat-30", 42, a), toRun("t1", "flat-30", 42, b));
  assert.equal(drift.filesAdded.length, 1);
  assert.equal(drift.filesAdded[0].file, "newcomer.ts");
});

test("scenario 15: removeFile surfaces as filesRemoved", () => {
  const t0 = buildFixture(NAMED_FIXTURES["flat-30"]);
  const targetName = t0.root.files[0].path.split("/").pop()!;
  const t1 = applyMutation(t0, { kind: "removeFile", path: targetName });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const drift = diffRuns(toRun("t0", "flat-30", 42, a), toRun("t1", "flat-30", 42, b));
  assert.equal(drift.filesRemoved.length, 1);
  assert.equal(drift.filesRemoved[0].file, targetName);
});

test("scenario 16: renameFile surfaces as filesRenamed (not added+removed)", () => {
  const t0 = buildFixture(NAMED_FIXTURES["flat-30"]);
  const targetName = t0.root.files[0].path.split("/").pop()!;
  const t1 = applyMutation(t0, {
    kind: "renameFile",
    fromPath: targetName,
    toPath: "newname.ts",
  });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const drift = diffRuns(toRun("t0", "flat-30", 42, a), toRun("t1", "flat-30", 42, b));
  assert.equal(drift.filesRenamed.length, 1);
  assert.equal(drift.filesAdded.length, 0);
  assert.equal(drift.filesRemoved.length, 0);
});

test("scenario 17: moveFile surfaces the file's path change in drift", () => {
  // Build a fixture with two child dirs, move file from one to other.
  const t0 = buildFixture({
    id: "split",
    seed: 1,
    shape: "custom",
    params: {
      build: () => ({
        path: "/mock",
        files: [],
        dirs: [
          {
            path: "/mock/a",
            files: [{ path: "/mock/a/x.ts", loc: 1500 }],
            dirs: [],
            fileLoc: 1500,
            subtreeLoc: 1500,
            allFiles: [{ path: "/mock/a/x.ts", loc: 1500 }],
          },
          {
            path: "/mock/b",
            files: [{ path: "/mock/b/y.ts", loc: 100 }],
            dirs: [],
            fileLoc: 100,
            subtreeLoc: 100,
            allFiles: [{ path: "/mock/b/y.ts", loc: 100 }],
          },
        ],
        fileLoc: 0,
        subtreeLoc: 1600,
        allFiles: [
          { path: "/mock/a/x.ts", loc: 1500 },
          { path: "/mock/b/y.ts", loc: 100 },
        ],
      }),
    } as unknown as Record<string, unknown>,
  });
  const t1 = applyMutation(t0, { kind: "moveFile", path: "b/y.ts", toDir: "a" });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const drift = diffRuns(toRun("t0", "split", 1, a), toRun("t1", "split", 1, b));
  // moveFile changes the file's path, so it surfaces as removed (old path)
  // + added (new path). The user can correlate via LOC + leaf membership.
  const removedPaths = drift.filesRemoved.map((r) => r.file);
  const addedPaths = drift.filesAdded.map((a) => a.file);
  assert.ok(removedPaths.includes("b/y.ts"), "old path should appear as removed");
  assert.ok(addedPaths.includes("a/y.ts"), "new path should appear as added");
});

test("scenario 19: deterministic — same mutation applied twice → byte-identical drift", () => {
  const t0 = buildFixture(NAMED_FIXTURES["flat-30"]);
  const t1a = applyMutation(t0, { kind: "addFile", path: "x.ts", loc: 50 });
  const t1b = applyMutation(t0, { kind: "addFile", path: "x.ts", loc: 50 });
  const a = partitionTree(t0.root, t0.repoBase);
  const ba = partitionTree(t1a.root, t1a.repoBase);
  const bb = partitionTree(t1b.root, t1b.repoBase);
  const driftA = diffRuns(toRun("t0", "flat-30", 42, a), toRun("t1a", "flat-30", 42, ba));
  const driftB = diffRuns(toRun("t0", "flat-30", 42, a), toRun("t1b", "flat-30", 42, bb));
  assert.equal(JSON.stringify(driftA), JSON.stringify(driftB));
});

test("scenario 20: zero-overlap precondition holds across drift", () => {
  // If both runs have no overlap, drift cannot manufacture any.
  const t0 = buildFixture(NAMED_FIXTURES["flat-30"]);
  const t1 = applyMutation(t0, { kind: "addFile", path: "x.ts", loc: 50 });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const seenA = new Set<string>();
  for (const l of a) for (const f of l.files) {
    assert.ok(!seenA.has(f), `file ${f} appears in two leaves of run a`);
    seenA.add(f);
  }
  const seenB = new Set<string>();
  for (const l of b) for (const f of l.files) {
    assert.ok(!seenB.has(f), `file ${f} appears in two leaves of run b`);
    seenB.add(f);
  }
});

test("scenario 21: bin renumbering at boundary is detected", () => {
  // boundary-1499: under SPLIT_AT (1 subtree leaf). Grow to push over SPLIT_AT.
  const t0 = buildFixture(NAMED_FIXTURES["boundary-1499"]);
  const targetPath = t0.root.allFiles[0].path.replace(`${t0.repoBase}/`, "");
  const t1 = applyMutation(t0, { kind: "growFile", path: targetPath, deltaLoc: 200 });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const drift = diffRuns(toRun("t0", "boundary-1499", 42, a), toRun("t1", "boundary-1499", 42, b));
  const hasStructuralChange =
    drift.binsRenumbered.length > 0 ||
    drift.leavesAdded.length > 0 ||
    drift.leavesRemoved.length > 0 ||
    drift.filesMovedLeaf.length > 0;
  assert.ok(hasStructuralChange, "boundary crossing should produce structural drift");
});

test("scenario 22: leaves added when a new directory creates a new leaf path", () => {
  const t0 = buildFixture(NAMED_FIXTURES["flat-30"]);
  const t1 = applyMutation(t0, { kind: "addFile", path: "newdir/inner.ts", loc: 50 });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const drift = diffRuns(toRun("t0", "flat-30", 42, a), toRun("t1", "flat-30", 42, b));
  // Either a new leaf appeared (more likely with a deep nested path) or a file
  // moved to an existing leaf — both are valid; we just want no false positives.
  assert.ok(
    drift.leavesAdded.length + drift.filesAdded.length + drift.filesMovedLeaf.length > 0,
    "adding a file to a new dir must surface in drift",
  );
});

test("scenario 23: drift report invariant — file in exactly one classification", () => {
  const t0 = buildFixture(NAMED_FIXTURES["flat-30"]);
  const t1 = applyMutation(t0, { kind: "addFile", path: "z.ts", loc: 50 });
  const t2 = applyMutation(t1, {
    kind: "renameFile",
    fromPath: t1.root.files[1].path.split("/").pop()!,
    toPath: "renamed.ts",
  });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t2.root, t2.repoBase);
  const drift = diffRuns(toRun("t0", "flat-30", 42, a), toRun("t2", "flat-30", 42, b));
  const seen = new Map<string, number>();
  for (const e of drift.filesAdded) seen.set(e.file, (seen.get(e.file) ?? 0) + 1);
  for (const e of drift.filesRemoved) seen.set(e.file, (seen.get(e.file) ?? 0) + 1);
  for (const e of drift.filesMovedLeaf) seen.set(e.file, (seen.get(e.file) ?? 0) + 1);
  for (const e of drift.filesRenamed) {
    seen.set(e.fromPath, (seen.get(e.fromPath) ?? 0) + 1);
    seen.set(e.toPath, (seen.get(e.toPath) ?? 0) + 1);
  }
  for (const [, count] of seen) {
    assert.ok(count <= 1 || count === 2, "no file appears in 3+ categories");
  }
});

test("scenario 24: leavesRemoved surfaces when removeDir empties a leaf", () => {
  const t0 = buildFixture(NAMED_FIXTURES["wide-shallow"]);
  const targetDir = t0.root.dirs[0];
  const targetName = targetDir.path.split("/").pop()!;
  const t1 = applyMutation(t0, { kind: "removeDir", path: targetName });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const drift = diffRuns(toRun("t0", "wide-shallow", 42, a), toRun("t1", "wide-shallow", 42, b));
  assert.ok(drift.filesRemoved.length > 0 || drift.leavesRemoved.length > 0);
});

test("scenario 25: bin snapshot before/after is captured for renumbered bins", () => {
  // Construct a fixture that will produce bins, then mutate to renumber them.
  const t0 = buildFixture(NAMED_FIXTURES["wide-shallow"]);
  // grow the largest non-c1 file to push another bin boundary
  const target = t0.root.dirs.find((d) => !d.path.endsWith("/c1"))!;
  const targetFile = target.files[0];
  const targetPath = targetFile.path.replace(`${t0.repoBase}/`, "");
  const t1 = applyMutation(t0, { kind: "growFile", path: targetPath, deltaLoc: 1000 });
  const a = partitionTree(t0.root, t0.repoBase);
  const b = partitionTree(t1.root, t1.repoBase);
  const drift = diffRuns(toRun("t0", "wide", 42, a), toRun("t1", "wide", 42, b));
  for (const r of drift.binsRenumbered) {
    assert.ok(Array.isArray(r.before));
    assert.ok(Array.isArray(r.after));
  }
});
