// `leaf scope-from-priority` — emit JSON listing files that belong to leaves
// of `low` or `lowest` priority. Downstream tools (vitest coverage.exclude,
// eslint .ignore, sonar.exclusions, …) consume this to derive their scope.
//
// **Rule:** the priority field is the only lever. Hand-editing a tool's
// exclude list to "make a number look better" is forbidden — raise (or accept)
// the priority instead.
//
// Source of truth: each leaf's LEAF.priority[.bin-N].md frontmatter.
// Output: leaf-coverage-scope.gitignored.json at the repo root.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "../repo-root.js";

const EXCLUDED_PRIORITIES = new Set(["low", "lowest"]);

interface ManifestLeaf {
  path: string;
  scope: "subtree" | "bin";
  binIndex?: number;
  binTotal?: number;
  files: string[];
}

interface Manifest {
  leaves: ManifestLeaf[];
}

function priorityDocPath(REPO: string, leaf: ManifestLeaf): string {
  const suffix = leaf.scope === "bin" ? `.bin-${leaf.binIndex}` : "";
  return join(REPO, leaf.path, `LEAF.priority${suffix}.md`);
}

function parsePriority(absPath: string): string | null {
  if (!existsSync(absPath)) return null;
  const txt = readFileSync(absPath, "utf8");
  const m = /^priority:\s*(\S+)/m.exec(txt);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return v === "unset" ? null : v;
}

export async function scopeFromPriority(_argv: string[]): Promise<void> {
  const REPO = repoRoot();
  const MANIFEST = join(REPO, "leaves.gitignored.json");
  const OUTPUT = join(REPO, "leaf-coverage-scope.gitignored.json");
  if (!existsSync(MANIFEST)) {
    throw new Error(`${MANIFEST} not found — run \`leaf partition\` first.`);
  }
  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const excludeFiles = new Set<string>();
  const stats = { totalLeaves: 0, excludedLeaves: 0, missingPriority: 0 };
  for (const leaf of manifest.leaves) {
    stats.totalLeaves++;
    const priority = parsePriority(priorityDocPath(REPO, leaf));
    if (priority === null) {
      stats.missingPriority++;
      continue;
    }
    if (!EXCLUDED_PRIORITIES.has(priority)) continue;
    stats.excludedLeaves++;
    for (const f of leaf.files) excludeFiles.add(f);
  }
  const out = {
    generatedAt: new Date().toISOString(),
    excludedPriorities: [...EXCLUDED_PRIORITIES],
    stats,
    excludeFiles: [...excludeFiles].sort(),
  };
  writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  process.stdout.write(
    `WROTE ${OUTPUT}\n` +
      `  excluded: ${out.excludeFiles.length} files from ${stats.excludedLeaves}/${stats.totalLeaves} leaves` +
      (stats.missingPriority > 0
        ? ` (${stats.missingPriority} leaves had no priority)\n`
        : "\n"),
  );
}
