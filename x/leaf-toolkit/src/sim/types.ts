// Runtime source of truth for the simulator's interfaces.
// Mirror of specs/001-leaf-allocation-sim/contracts/types.ts.

export interface FileNode {
  path: string;
  loc: number;
}

export interface DirNode {
  path: string;
  files: FileNode[];
  dirs: DirNode[];
  fileLoc: number;
  subtreeLoc: number;
  allFiles: FileNode[];
}

export interface Leaf {
  path: string;
  scope: "subtree" | "bin";
  binIndex?: number;
  binTotal?: number;
  /** Content-derived bin identifier (sha256 prefix over sorted file paths, 6 hex).
   *  Present iff scope === "bin" and binTotal > 1. Identity key for cross-run continuity. */
  binId?: string;
  members?: string[];
  files: string[];
  loc: number;
}

export interface PartitionOptions {
  /** Repo-relative dir paths previously emitted as scope==="bin". When absent or empty,
   *  hysteresis defaults under-threshold (FR-005). */
  priorBinDirs?: ReadonlySet<string>;
}

export type MigrationDomain = "partition" | "priority" | "audit" | "coverage" | string;

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

export type FixtureShape = "flat" | "deep" | "wide" | "boundary" | "custom";

export interface FixtureSpec {
  id: string;
  seed: number;
  shape: FixtureShape;
  params: Record<string, unknown>;
}

export interface FlatParams {
  fileCount: number;
  locPerFile: { mean: number; stddev: number };
}
export interface DeepParams {
  depth: number;
  filesPerLevel: number;
  locPerFile: { mean: number; stddev: number };
}
export interface WideParams {
  fanout: number;
  oversizeChildLoc: number;
  locPerFile: { mean: number; stddev: number };
}
export interface BoundaryParams {
  exactSubtreeLoc: 1500 | 1499 | 1501;
  siblingCount: number;
}
export interface CustomParams {
  build: (repoBase: string, prng: () => number) => DirNode;
}

export interface FixtureBuild {
  spec: FixtureSpec;
  repoBase: string;
  root: DirNode;
}

export interface PartitionRun {
  runId: string;
  fixtureId: string;
  seed: number;
  leaves: Leaf[];
  totalLoc: number;
  totalFiles: number;
  generatedAt: string;
}

export interface OverlapReport {
  overlapCount: number;
  overlaps: Array<{ file: string; leaves: string[] }>;
  intraLeafDuplicates: Array<{ leaf: string; file: string }>;
}

export interface BinSnapshot {
  binId: string;
  binIndex: number;
  files: string[];
}

export interface DriftReport {
  filesAdded: Array<{ file: string; toLeaf: string }>;
  filesRemoved: Array<{ file: string; fromLeaf: string }>;
  filesMovedLeaf: Array<{ file: string; fromLeaf: string; toLeaf: string }>;
  filesRenamed: Array<{ fromPath: string; toPath: string; leaf: string }>;
  binsRenumbered: Array<{ path: string; before: BinSnapshot[]; after: BinSnapshot[] }>;
  leavesAdded: string[];
  leavesRemoved: string[];
}

export type AllocationStrategy =
  | "round-robin"
  | "random-uniform"
  | "random-uniform-rep"
  | "priority-weighted";

export interface Allocation {
  strategy: AllocationStrategy;
  seed: number;
  k: number;
  assignments: Array<{ agentId: number; leafIds: string[] }>;
}

export interface CollisionPair {
  agentA: number;
  agentB: number;
  sharedLeaves: string[];
  sharedFiles: string[];
}

export interface AgentLoad {
  agentId: number;
  leafCount: number;
  fileCount: number;
  totalLoc: number;
}

export interface CollisionMatrix {
  pairs: CollisionPair[];
  agentLoad: AgentLoad[];
}

export interface Stats {
  mean: number;
  stddev: number;
  min: number;
  max: number;
  maxOverMin: number | null;
}

export interface BalanceReport {
  leafCount: number;
  totalLoc: number;
  totalFiles: number;
  loc: Stats;
  files: Stats;
  verdict: "well-balanced" | "skewed" | "unbalanced" | "n/a";
}

export interface SimReport {
  runs: PartitionRun[];
  overlap: OverlapReport;
  drift: DriftReport | null;
  allocation: Allocation;
  collisions: CollisionMatrix;
  visualisation: string;
  balance: BalanceReport;
  summary: string;
}

export type Mutate =
  | { kind: "addFile"; path: string; loc: number }
  | { kind: "removeFile"; path: string }
  | { kind: "growFile"; path: string; deltaLoc: number }
  | { kind: "shrinkFile"; path: string; deltaLoc: number }
  | { kind: "renameFile"; fromPath: string; toPath: string }
  | { kind: "moveFile"; path: string; toDir: string }
  | { kind: "addDir"; path: string }
  | { kind: "removeDir"; path: string };

export interface AllocateOptions {
  strategy: AllocationStrategy;
  k: number;
  seed: number;
  priorityOf?: (leafId: string) => number;
}

export interface ReportOptions {
  fixture: FixtureBuild;
  mutation?: Mutate;
  allocation: AllocateOptions;
}
