// Shared types across verbs and plugins.

export type Priority = "critical" | "high" | "medium" | "normal" | "low" | "lowest";

export interface Leaf {
  /** Repo-relative directory representing the leaf. */
  path: string;
  /** Whole subtree, or one bin of an oversized subtree. */
  scope: "subtree" | "bin";
  /** When scope === "bin": 1-based index out of binTotal. */
  binIndex?: number;
  binTotal?: number;
  /** When scope === "bin": child paths covered by this bin. */
  members?: string[];
  /** All files (repo-relative) included in the leaf. */
  files: string[];
  /** Total LOC of files. */
  loc: number;
}

export interface Manifest {
  generatedAt: string;
  targetLoc: number;
  splitAt: number;
  leafCount: number;
  totalLoc: number;
  totalFiles: number;
  leaves: Leaf[];
}

/** Plugin contract for any work-type domain (coverage, refactor, security, …). */
export interface DomainPlugin<Status = unknown, Target = unknown> {
  /** Domain name. Becomes LEAF.<name>.md and the `leaf <verb> <name>` selector. */
  name: string;

  /** Compute the current state of this domain for one leaf. */
  fetchStatus(leaf: Leaf, opts?: { repoRoot: string }): Promise<Status>;

  /** Decide whether the leaf is "done" against a target. */
  isAtTarget(status: Status, target: Target): boolean;

  /** Render the body of LEAF.<name>.md for this leaf. Frontmatter is added by the
   *  framework — your renderer returns markdown only. */
  renderDoc(leaf: Leaf, status: Status): { frontmatter: Record<string, unknown>; body: string };

  /** Optionally emit files this leaf wants to exclude from downstream measurement.
   *  Used by `leaf scope-from-priority` to derive coverage/eslint/etc. excludes. */
  scopeOptOut?(leaf: Leaf, priority: Priority): string[] | null;
}
