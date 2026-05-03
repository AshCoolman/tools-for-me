// Public TS interface extensions for the partition-stability fix (spec 002).
// These are additive on top of `specs/001-leaf-allocation-sim/contracts/types.ts`.
// The implementation lives under `src/sim/` and re-exports these types.

import type { DirNode, Leaf as LeafBase } from "../../001-leaf-allocation-sim/contracts/types.js";

// ─── Leaf (extended — additive) ──────────────────────────────────────────────

export interface Leaf extends LeafBase {
  /**
   * Content-derived bin identifier. Present iff `scope === "bin"` and `binTotal > 1`.
   * 6 hex chars (sha256 prefix over sorted, "\n"-joined repo-relative file paths).
   * Identity key for cross-run continuity.
   */
  binId?: string;
}

// ─── BinSnapshot (extended) ──────────────────────────────────────────────────

export interface BinSnapshot {
  binId: string;
  binIndex: number; // retained for human-readable diff output; not load-bearing
  files: string[];
}

// ─── Partition options ───────────────────────────────────────────────────────

export interface PartitionOptions {
  /**
   * Repo-relative dir paths previously emitted as `scope === "bin"`.
   * When absent or empty, FR-005 default applies: directories inside the
   * hysteresis band emit a single subtree leaf.
   */
  priorBinDirs?: ReadonlySet<string>;
}

export type PartitionTree = (
  root: DirNode,
  repoBase: string,
  options?: PartitionOptions,
) => Leaf[];

// ─── Migration ───────────────────────────────────────────────────────────────

export type MigrationDomain = "partition" | "priority" | "audit" | string;

export interface MigrationRename {
  oldName: string;
  newName: string;
  leafPath: string;
  domain: MigrationDomain;
}

export interface MigrationUnchanged {
  name: string;
  leafPath: string;
  reason: "already migrated" | "same hash";
}

export interface MigrationOrphan {
  name: string;
  leafPath: string;
  reason: "no matching bin in new partition" | "ambiguous match";
}

export interface MigrationReport {
  renamed: MigrationRename[];
  unchanged: MigrationUnchanged[];
  orphaned: MigrationOrphan[];
}

export type Migrate = (repoBase: string) => Promise<MigrationReport>;

// ─── Helpers exposed for the simulator ───────────────────────────────────────

export type ReadPriorBinDirsFromFs = (
  repoBase: string,
  candidateDirs: readonly string[],
) => ReadonlySet<string>;

export type LeafIdentity = (leaf: Leaf) => string;

/**
 * Computes the content-derived bin id for a sorted list of repo-relative paths.
 * Exposed so tests can verify determinism without going through `partitionTree`.
 */
export type ComputeBinId = (sortedFilePaths: readonly string[]) => string;
