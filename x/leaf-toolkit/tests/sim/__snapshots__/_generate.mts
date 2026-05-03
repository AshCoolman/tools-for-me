// One-off snapshot generator. Run with:
//   npx tsx tests/sim/__snapshots__/_generate.mts
// Re-run only when the frozen fixture under tests/sim/__fixtures__/host-src-snapshot/
// is intentionally regenerated. The snapshot anchors tests/sim/refactor-regression.test.ts.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFromFs } from "../../../src/sim/core/dirnode.js";
import { partitionTree, TARGET_LOC, SPLIT_AT } from "../../../src/sim/core/partition-core.js";

const fixtureRoot = resolve(import.meta.dirname, "../__fixtures__/host-src-snapshot");
const repoBase = resolve(fixtureRoot, "..");
const srcRoot = resolve(fixtureRoot);

const root = buildFromFs(srcRoot);
const leaves = partitionTree(root, repoBase);

const out = {
  generatedAt: "DETERMINISTIC",
  targetLoc: TARGET_LOC,
  splitAt: SPLIT_AT,
  leafCount: leaves.length,
  totalLoc: leaves.reduce((a, l) => a + l.loc, 0),
  totalFiles: leaves.reduce((a, l) => a + l.files.length, 0),
  leaves,
};

const outPath = resolve(import.meta.dirname, "leaves.gitignored.json");
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
process.stdout.write(`Wrote ${leaves.length} leaves → ${outPath}\n`);
