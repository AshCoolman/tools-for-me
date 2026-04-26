// Builtin coverage plugin. Treat as the reference implementation — copy when
// adding new domains. Fetches a vitest summary block (per-package coverage txt)
// and renders the leaf's LEAF.coverage.md.
//
// Stub: port logic from scripts/leaf-link-coverage.mts and
// scripts/leaf-coverage-status.mts.

import type { DomainPlugin, Leaf, Priority } from "../types.js";

export interface CoverageStatus {
  lines: number | null;
  branches: number | null;
  funcs: number | null;
  stmts: number | null;
  source: string;
  hint?: string;
}

export const coveragePlugin: DomainPlugin<CoverageStatus, number> = {
  name: "coverage",

  async fetchStatus(_leaf: Leaf): Promise<CoverageStatus> {
    throw new Error("coverage.fetchStatus not yet implemented");
  },

  isAtTarget(s, target) {
    return [s.lines, s.branches, s.funcs, s.stmts].every((v) => v !== null && v >= target);
  },

  renderDoc(leaf, s) {
    return {
      frontmatter: {
        domain: "coverage",
        leafPath: leaf.path,
        generatedAt: new Date().toISOString(),
        status: { lines: s.lines, branches: s.branches, funcs: s.funcs, stmts: s.stmts },
      },
      body:
        `# Coverage — \`${leaf.path}\`\n\n` +
        (s.hint
          ? `> **Hint:** ${s.hint}\n\n`
          : `- lines ${s.lines}% / branches ${s.branches}% / funcs ${s.funcs}% / stmts ${s.stmts}%\n`),
    };
  },

  scopeOptOut(leaf: Leaf, priority: Priority): string[] | null {
    return priority === "low" || priority === "lowest" ? leaf.files : null;
  },
};
