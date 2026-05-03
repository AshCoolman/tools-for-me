// Baseline against the host repo's real src/ — scenario 100.
// Writes baseline/* under specs/001-leaf-allocation-sim/. Test passes if
// summary === "clean" OR if the named weakness is captured in the artefacts
// (per SC-006: either outcome is acceptable evidence).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildFromFs } from "../../src/sim/core/dirnode.js";
import { report, summarisePretty } from "../../src/sim/report.js";
import type { FixtureBuild } from "../../src/sim/types.js";

const REPO = resolve(import.meta.dirname, "../..");
const SRC = join(REPO, "src");
const OUT_DIR = join(REPO, "specs/001-leaf-allocation-sim/baseline");

test("scenario 100: baseline against real src/ produces all expected artefacts", () => {
  if (!existsSync(SRC)) {
    assert.fail(`expected src/ to exist at ${SRC}`);
  }
  const root = buildFromFs(SRC);
  const fixture: FixtureBuild = {
    spec: { id: "real", seed: 42, shape: "custom", params: {} },
    repoBase: REPO,
    root,
  };
  const r = report({
    fixture,
    allocation: { strategy: "round-robin", k: 4, seed: 42 },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "overlap.txt"), JSON.stringify(r.overlap, null, 2) + "\n");
  writeFileSync(
    join(OUT_DIR, "drift-self.txt"),
    JSON.stringify(r.drift ?? { note: "single run — no drift computed" }, null, 2) + "\n",
  );
  writeFileSync(
    join(OUT_DIR, "allocation-rr-k4.txt"),
    JSON.stringify({ allocation: r.allocation, collisions: r.collisions }, null, 2) + "\n",
  );
  writeFileSync(join(OUT_DIR, "visualisation.txt"), r.visualisation + "\n");
  writeFileSync(join(OUT_DIR, "metrics.txt"), JSON.stringify(r.balance, null, 2) + "\n");
  writeFileSync(
    join(OUT_DIR, "summary.txt"),
    `${r.summary}\n\n${summarisePretty(r)}\n`,
  );

  // All files exist and are non-empty.
  for (const name of ["overlap.txt", "drift-self.txt", "allocation-rr-k4.txt", "visualisation.txt", "metrics.txt", "summary.txt"]) {
    const path = join(OUT_DIR, name);
    assert.ok(existsSync(path), `${name} should exist`);
    const content = readFileSync(path, "utf-8");
    assert.ok(content.length > 0, `${name} should be non-empty`);
  }

  // SC-006: either clean OR a captured weakness — both pass.
  assert.ok(
    r.summary === "clean" || r.summary.startsWith("violations:"),
    `summary should be 'clean' or 'violations: ...'; got: ${r.summary}`,
  );
});
