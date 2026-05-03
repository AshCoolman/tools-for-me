// Public TS interfaces for the Leaf Allocation Simulator.
// This file is the source of truth for module boundaries; the implementation
// lives under `src/sim/` and re-exports these types.

// ─── Core (existing — unchanged shapes from src/commands/partition.ts) ────────

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
  members?: string[];
  files: string[];
  loc: number;
}

// ─── Fixture builder ──────────────────────────────────────────────────────────

export type FixtureShape = "flat" | "deep" | "wide" | "boundary" | "custom";

export interface FixtureSpec {
  id: string;
  seed: number;
  shape: FixtureShape;
  params: Record<string, unknown>;
}

export interface FlatParams { fileCount: number; locPerFile: { mean: number; stddev: number } }
export interface DeepParams { depth: number; filesPerLevel: number; locPerFile: { mean: number; stddev: number } }
export interface WideParams { fanout: number; oversizeChildLoc: number; locPerFile: { mean: number; stddev: number } }
export interface BoundaryParams { exactSubtreeLoc: 1500 | 1499 | 1501; siblingCount: number }
export interface CustomParams { build: (repoBase: string, prng: () => number) => DirNode }

export interface FixtureBuild {
  spec: FixtureSpec;
  repoBase: string;
  root: DirNode;
}

// ─── Partition runs ───────────────────────────────────────────────────────────

export interface PartitionRun {
  runId: string;
  fixtureId: string;
  seed: number;
  leaves: Leaf[];
  totalLoc: number;
  totalFiles: number;
  generatedAt: string; // excluded from determinism comparisons
}

// ─── Overlap (safety) ─────────────────────────────────────────────────────────

export interface OverlapReport {
  overlapCount: number;
  overlaps: Array<{ file: string; leaves: string[] }>;
  intraLeafDuplicates: Array<{ leaf: string; file: string }>;
}

// ─── Drift ────────────────────────────────────────────────────────────────────

export interface BinSnapshot { binIndex: number; files: string[] }

export interface DriftReport {
  filesAdded: Array<{ file: string; toLeaf: string }>;
  filesRemoved: Array<{ file: string; fromLeaf: string }>;
  filesMovedLeaf: Array<{ file: string; fromLeaf: string; toLeaf: string }>;
  filesRenamed: Array<{ fromPath: string; toPath: string; leaf: string }>;
  binsRenumbered: Array<{ path: string; before: BinSnapshot[]; after: BinSnapshot[] }>;
  leavesAdded: string[];
  leavesRemoved: string[];
}

// ─── Allocation ───────────────────────────────────────────────────────────────

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

// ─── Balance ──────────────────────────────────────────────────────────────────

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

// ─── Full report ──────────────────────────────────────────────────────────────

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

// ─── Function signatures (the load-bearing ones) ─────────────────────────────

export type PartitionTree = (root: DirNode, repoBase: string) => Leaf[];

export type BuildFromFs = (absRoot: string) => DirNode;

export type BuildFromMock = (spec: FixtureSpec, repoBase?: string) => FixtureBuild;

export type Mutate =
  | { kind: "addFile";    path: string; loc: number }
  | { kind: "removeFile"; path: string }
  | { kind: "growFile";   path: string; deltaLoc: number }
  | { kind: "shrinkFile"; path: string; deltaLoc: number }
  | { kind: "renameFile"; fromPath: string; toPath: string }
  | { kind: "moveFile";   path: string; toDir: string }
  | { kind: "addDir";     path: string }
  | { kind: "removeDir";  path: string };

export type ApplyMutation = (build: FixtureBuild, m: Mutate) => FixtureBuild;

export type CheckOverlap = (leaves: Leaf[]) => OverlapReport;

export type DiffRuns = (prev: PartitionRun, curr: PartitionRun) => DriftReport;

export interface AllocateOptions {
  strategy: AllocationStrategy;
  k: number;
  seed: number;
  /** Required when strategy === "priority-weighted". Returns a non-negative weight per leaf. */
  priorityOf?: (leafId: string) => number;
}

export type Allocate = (leaves: Leaf[], opts: AllocateOptions) => Allocation;

export type CollisionMatrixFn = (allocation: Allocation, leaves: Leaf[]) => CollisionMatrix;

export type RenderAscii = (root: DirNode, leaves: Leaf[], opts?: { showExcluded?: boolean }) => string;

export type BalanceMetrics = (leaves: Leaf[]) => BalanceReport;

export interface ReportOptions {
  fixture: FixtureBuild;
  mutation?: Mutate;
  allocation: AllocateOptions;
}

export type Report = (opts: ReportOptions) => SimReport;
