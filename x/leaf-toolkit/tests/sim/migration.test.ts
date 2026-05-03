// US4 (FR-009..FR-013, SC-006): on-disk filename migration from binIndex →
// binId, covering rename, orphan, idempotency, and the manifest-absent fallback.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildFromFs } from "../../src/sim/core/dirnode.js";
import { partitionTree } from "../../src/sim/core/partition-core.js";
import { runMigration } from "../../src/commands/partition.js";

interface ScratchRepo {
  REPO: string;
  pkgRoot: string;
  cleanup(): void;
}

function makeScratchRepo(): ScratchRepo {
  const REPO = mkdtempSync(join(tmpdir(), "leaf-migrate-"));
  // Minimal package.json so repoRoot helpers don't break if invoked.
  writeFileSync(join(REPO, "package.json"), JSON.stringify({ name: "scratch", version: "0" }));
  return {
    REPO,
    pkgRoot: REPO,
    cleanup() {
      rmSync(REPO, { recursive: true, force: true });
    },
  };
}

function makeOversizeFixtureUnder(root: string): string {
  // src/<root>/  with 6 sibling dirs, each holding one .ts file at ~283 LOC,
  // total = 1700 LOC → forces bin path under hysteresis upper band.
  const srcDir = join(root, "src");
  mkdirSync(srcDir, { recursive: true });
  for (let i = 1; i <= 6; i++) {
    const sub = join(srcDir, `s${i}`);
    mkdirSync(sub, { recursive: true });
    const lines = i <= 2 ? 290 : 280;
    writeFileSync(join(sub, "f.ts"), Array.from({ length: lines }, (_, k) => `// l${k}`).join("\n"));
  }
  return srcDir;
}

function listLeafDocs(dir: string): string[] {
  const out: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(d, entry.name));
      else if (entry.isFile() && /^LEAF\.[a-z]+\.bin-/.test(entry.name)) out.push(join(d, entry.name));
    }
  }
  walk(dir);
  return out;
}

test("scenario 1 (rename): legacy LEAF.priority/audit.bin-N.md files rename to bin-<binId>.md", () => {
  const scratch = makeScratchRepo();
  try {
    const srcDir = makeOversizeFixtureUnder(scratch.REPO);
    // Run partition to learn the new binIds.
    const root = buildFromFs(srcDir);
    const leaves = partitionTree(root, scratch.REPO);
    const bins = leaves.filter((l) => l.scope === "bin");
    assert.ok(bins.length >= 2, `expected ≥ 2 bin leaves, got ${bins.length}`);

    // Plant legacy filenames at each bin's parent dir. binIndex-keyed.
    for (const leaf of bins) {
      const dir = join(scratch.REPO, leaf.path);
      writeFileSync(
        join(dir, `LEAF.priority.bin-${leaf.binIndex}.md`),
        `priority: medium\nfromBin=${leaf.binIndex}\n`,
      );
      writeFileSync(
        join(dir, `LEAF.audit.bin-${leaf.binIndex}.md`),
        `audit: stub\nfromBin=${leaf.binIndex}\n`,
      );
    }
    // No prior manifest yet → migration uses enclosing-directory fallback.
    const report = runMigration(scratch.REPO, leaves, [srcDir]);
    assert.equal(report.orphaned.length, 0, `unexpected orphans: ${JSON.stringify(report.orphaned)}`);
    assert.equal(report.renamed.length, bins.length * 2, "expected priority+audit rename per bin");
    const domains = new Set(report.renamed.map((r) => r.domain));
    assert.deepEqual(domains, new Set(["priority", "audit"]));

    // Every renamed file ends in `.bin-<6hex>.md`.
    for (const r of report.renamed) {
      assert.match(r.newName, /\.bin-[0-9a-f]{6}\.md$/);
      assert.ok(existsSync(join(scratch.REPO, r.leafPath, r.newName)));
    }
  } finally {
    scratch.cleanup();
  }
});

test("scenario 2 (orphan): legacy file whose new partition has no matching bin is left in place", () => {
  const scratch = makeScratchRepo();
  try {
    const srcDir = makeOversizeFixtureUnder(scratch.REPO);
    const root = buildFromFs(srcDir);
    const leaves = partitionTree(root, scratch.REPO);
    const bins = leaves.filter((l) => l.scope === "bin");

    // Plant a legacy file at a leafPath that *isn't* a bin in the new partition.
    const subtreeLeaves = leaves.filter((l) => l.scope === "subtree");
    const target = subtreeLeaves[0] ?? bins[0];
    const orphanDir = join(scratch.REPO, target.path);
    const orphanFile = join(orphanDir, "LEAF.priority.bin-99.md");
    writeFileSync(orphanFile, "priority: medium\n");

    const report = runMigration(scratch.REPO, leaves, [srcDir]);

    // It must NOT be deleted, and it must show up in the report.
    if (target.scope === "subtree") {
      // No bins at this dir → the legacy file is orphaned.
      const orphan = report.orphaned.find((o) => o.name === "LEAF.priority.bin-99.md");
      assert.ok(orphan, "expected orphan report for legacy file at subtree dir");
      assert.ok(existsSync(orphanFile), "orphan file must NOT be deleted");
    }
  } finally {
    scratch.cleanup();
  }
});

test("scenario 3 (idempotent): a second migration run reports zero renames and zero orphans", () => {
  const scratch = makeScratchRepo();
  try {
    const srcDir = makeOversizeFixtureUnder(scratch.REPO);
    const root = buildFromFs(srcDir);
    const leaves = partitionTree(root, scratch.REPO);
    const bins = leaves.filter((l) => l.scope === "bin");

    for (const leaf of bins) {
      const dir = join(scratch.REPO, leaf.path);
      writeFileSync(join(dir, `LEAF.priority.bin-${leaf.binIndex}.md`), "priority: medium\n");
    }
    const first = runMigration(scratch.REPO, leaves, [srcDir]);
    assert.ok(first.renamed.length > 0, "first run should rename something");

    const second = runMigration(scratch.REPO, leaves, [srcDir]);
    assert.equal(second.renamed.length, 0, "second run must not rename anything");
    assert.equal(second.orphaned.length, 0, "second run must not orphan anything");
    // Every file from the first run shows up in unchanged on the second.
    assert.equal(second.unchanged.length, first.renamed.length);
  } finally {
    scratch.cleanup();
  }
});

test("scenario 4 (manifest-absent fallback): heuristic resolves legacy bin-N filenames without a prior manifest", () => {
  const scratch = makeScratchRepo();
  try {
    const srcDir = makeOversizeFixtureUnder(scratch.REPO);
    const root = buildFromFs(srcDir);
    const leaves = partitionTree(root, scratch.REPO);
    const bins = leaves.filter((l) => l.scope === "bin");

    // Plant only legacy bin-N files (no leaves.gitignored.json on disk).
    for (const leaf of bins) {
      const dir = join(scratch.REPO, leaf.path);
      writeFileSync(join(dir, `LEAF.priority.bin-${leaf.binIndex}.md`), "priority: medium\n");
    }
    assert.ok(!existsSync(join(scratch.REPO, "leaves.gitignored.json")));

    const report = runMigration(scratch.REPO, leaves, [srcDir]);
    // With matched bin counts and 1-based ordering, every legacy file resolves.
    assert.equal(report.orphaned.length, 0);
    assert.equal(report.renamed.length, bins.length);
    for (const r of report.renamed) assert.match(r.newName, /\.bin-[0-9a-f]{6}\.md$/);
  } finally {
    scratch.cleanup();
  }
});

test("invariant: renamed + unchanged + orphaned === total LEAF.*.bin-*.md files", () => {
  const scratch = makeScratchRepo();
  try {
    const srcDir = makeOversizeFixtureUnder(scratch.REPO);
    const root = buildFromFs(srcDir);
    const leaves = partitionTree(root, scratch.REPO);
    const bins = leaves.filter((l) => l.scope === "bin");
    for (const leaf of bins) {
      const dir = join(scratch.REPO, leaf.path);
      writeFileSync(join(dir, `LEAF.priority.bin-${leaf.binIndex}.md`), "priority: medium\n");
    }
    const planted = listLeafDocs(scratch.REPO).length;
    const report = runMigration(scratch.REPO, leaves, [srcDir]);
    assert.equal(
      report.renamed.length + report.unchanged.length + report.orphaned.length,
      planted,
    );
  } finally {
    scratch.cleanup();
  }
});
