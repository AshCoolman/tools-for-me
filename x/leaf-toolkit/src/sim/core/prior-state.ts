// Inspect a workspace tree for committed `LEAF.<domain>.bin-*.md` files. The set
// of repo-relative directories that contain at least one such file is the
// "prior bin state" — used by partitionTree's hysteresis branch (FR-005) to
// keep an in-band directory in bin mode if it was previously emitted as bins.
//
// Regex matches both legacy (`bin-1`, `bin-12`) and migrated (`bin-3a7f2c`)
// suffixes — migration must work without prior knowledge of the format.

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const BIN_DOC_RE = /^LEAF\.[a-z]+\.bin-[A-Za-z0-9]+\.md$/;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

function walk(dir: string, hits: Set<string>): void {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  let dirHasBinDoc = false;
  for (const e of entries) {
    if (!dirHasBinDoc && e.isFile() && BIN_DOC_RE.test(e.name)) {
      dirHasBinDoc = true;
    }
  }
  if (dirHasBinDoc) hits.add(dir);
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name.startsWith(".")) continue;
    walk(join(dir, e.name), hits);
  }
}

export function readPriorBinDirsFromFs(
  repoBase: string,
  candidateDirs: readonly string[],
): ReadonlySet<string> {
  const hits = new Set<string>();
  for (const abs of candidateDirs) {
    try {
      if (!statSync(abs).isDirectory()) continue;
    } catch {
      continue;
    }
    walk(abs, hits);
  }
  const out = new Set<string>();
  for (const abs of hits) out.add(relative(repoBase, abs));
  return out;
}
