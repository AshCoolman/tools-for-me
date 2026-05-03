// Visualisation — scenarios 41, 42, 44, 45, 46, 49, 50.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, NAMED_FIXTURES } from "../../src/sim/fixtures.js";
import { partitionTree } from "../../src/sim/core/partition-core.js";
import { renderAscii } from "../../src/sim/visualise.js";

test("scenario 41: rendered output includes a legend mapping ids to leaves", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const out = renderAscii(f.root, leaves);
  assert.ok(out.includes("Legend:"), "output must include legend section");
  assert.ok(out.match(/L1 →/), "legend must label leaves L1, L2, ...");
});

test("scenario 42: every file in the tree appears in the rendered output", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const out = renderAscii(f.root, leaves);
  for (const file of f.root.allFiles) {
    const base = file.path.split("/").pop()!;
    assert.ok(out.includes(base), `file ${base} should appear in render`);
  }
});

test("scenario 44: bin leaves are annotated with content-derived binId in the legend", () => {
  const f = buildFixture(NAMED_FIXTURES["wide-shallow"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const out = renderAscii(f.root, leaves);
  const hasBin = leaves.some((l) => l.scope === "bin");
  if (hasBin) {
    assert.ok(
      /#[0-9a-f]{6}\b/.test(out),
      "render legend must include path#binId labels when bins exist",
    );
  }
});

test("scenario 45: output uses ASCII box-drawing chars only — markdown-safe", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const out = renderAscii(f.root, leaves);
  // Each char beyond plain ASCII must be one of: ├ └ │
  for (const ch of out) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) continue; // ASCII
    if (ch === "├" || ch === "└" || ch === "│" || ch === "─" || ch === "→") continue;
    assert.fail(`unexpected non-ASCII char in render: ${ch} (U+${code.toString(16)})`);
  }
});

test("scenario 46: deterministic — same input → byte-identical render", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const out1 = renderAscii(f.root, leaves);
  const out2 = renderAscii(f.root, leaves);
  assert.equal(out1, out2);
});

test("scenario 49: file annotations carry leaf id matching the legend", () => {
  const f = buildFixture(NAMED_FIXTURES["flat-30"]);
  const leaves = partitionTree(f.root, f.repoBase);
  const out = renderAscii(f.root, leaves);
  // Each file should have [L<n>] tag and the n must appear in the legend.
  const fileTagMatches = [...out.matchAll(/\[L(\d+)\]/g)].map((m) => m[1]);
  const legendMatches = [...out.matchAll(/L(\d+) →/g)].map((m) => m[1]);
  for (const tag of fileTagMatches) {
    assert.ok(legendMatches.includes(tag), `tag L${tag} on file must exist in legend`);
  }
});

test("scenario 50: empty tree renders only the legend section header", () => {
  const empty = {
    spec: NAMED_FIXTURES["flat-30"],
    repoBase: "/mock",
    root: { path: "/mock/empty", files: [], dirs: [], fileLoc: 0, subtreeLoc: 0, allFiles: [] },
  };
  const out = renderAscii(empty.root, []);
  assert.ok(out.includes("Legend:"));
});
