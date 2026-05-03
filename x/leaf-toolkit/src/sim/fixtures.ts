// Built-in fixture builders. Each named shape returns a FixtureBuild whose
// root is a synthetic DirNode ready for partitionTree.

import { makePrng } from "./prng.js";
import { buildFromMock, type MockDescriptor } from "./core/dirnode.js";
import type {
  FixtureBuild,
  FixtureSpec,
  FlatParams,
  DeepParams,
  WideParams,
  BoundaryParams,
} from "./types.js";

export const DEFAULT_REPO_BASE = "/mock";

function gaussianLoc(prng: () => number, mean: number, stddev: number): number {
  // Box-Muller to a Gaussian, then clamp to integer ≥ 1.
  const u1 = Math.max(prng(), Number.EPSILON);
  const u2 = prng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(1, Math.round(mean + z * stddev));
}

function flatBuild(spec: FixtureSpec, params: FlatParams): MockDescriptor {
  const prng = makePrng(spec.seed);
  const desc: MockDescriptor = {};
  const pad = String(params.fileCount).length;
  for (let i = 0; i < params.fileCount; i++) {
    const name = `f${String(i + 1).padStart(pad, "0")}.ts`;
    desc[name] = { loc: gaussianLoc(prng, params.locPerFile.mean, params.locPerFile.stddev) };
  }
  return desc;
}

function deepBuild(spec: FixtureSpec, params: DeepParams): MockDescriptor {
  const prng = makePrng(spec.seed);
  // Build the descriptor inside out: deepest level first.
  let inner: MockDescriptor = {};
  for (let level = params.depth - 1; level >= 0; level--) {
    const layer: MockDescriptor = { ...inner };
    for (let i = 0; i < params.filesPerLevel; i++) {
      layer[`f${i + 1}.ts`] = {
        loc: gaussianLoc(prng, params.locPerFile.mean, params.locPerFile.stddev),
      };
    }
    inner = level === 0 ? layer : { [`l${level}`]: layer };
  }
  return inner;
}

function wideBuild(spec: FixtureSpec, params: WideParams): MockDescriptor {
  const prng = makePrng(spec.seed);
  const desc: MockDescriptor = {};
  for (let i = 0; i < params.fanout; i++) {
    const childName = `c${i + 1}`;
    if (i === 0) {
      // One oversize child to force bin packing at the parent.
      const child: MockDescriptor = {};
      const fileCount = Math.max(1, Math.ceil(params.oversizeChildLoc / params.locPerFile.mean));
      let remaining = params.oversizeChildLoc;
      for (let j = 0; j < fileCount; j++) {
        const isLast = j === fileCount - 1;
        const loc = isLast
          ? Math.max(1, remaining)
          : Math.max(1, gaussianLoc(prng, params.locPerFile.mean, params.locPerFile.stddev));
        remaining -= loc;
        child[`o${j + 1}.ts`] = { loc };
      }
      desc[childName] = child;
    } else {
      desc[childName] = {
        [`f1.ts`]: { loc: gaussianLoc(prng, params.locPerFile.mean, params.locPerFile.stddev) },
      };
    }
  }
  return desc;
}

function boundaryBuild(_spec: FixtureSpec, params: BoundaryParams): MockDescriptor {
  // Construct N sibling SUB-DIRS each containing one file. Sum of subtree LOC
  // equals `exactSubtreeLoc`. Sub-dirs (not just files) so the partition has
  // candidates for bin packing once the parent crosses SPLIT_AT.
  const desc: MockDescriptor = {};
  const target = params.exactSubtreeLoc;
  const n = params.siblingCount;
  const base = Math.floor(target / n);
  const remainder = target - base * n;
  for (let i = 0; i < n; i++) {
    const loc = base + (i < remainder ? 1 : 0);
    desc[`s${i + 1}`] = { [`f.ts`]: { loc } };
  }
  return desc;
}

export function buildFixture(spec: FixtureSpec, repoBase: string = DEFAULT_REPO_BASE): FixtureBuild {
  let descriptor: MockDescriptor;
  switch (spec.shape) {
    case "flat":
      descriptor = flatBuild(spec, spec.params as unknown as FlatParams);
      break;
    case "deep":
      descriptor = deepBuild(spec, spec.params as unknown as DeepParams);
      break;
    case "wide":
      descriptor = wideBuild(spec, spec.params as unknown as WideParams);
      break;
    case "boundary":
      descriptor = boundaryBuild(spec, spec.params as unknown as BoundaryParams);
      break;
    case "custom": {
      const prng = makePrng(spec.seed);
      const root = (spec.params as { build: (base: string, p: () => number) => unknown }).build(
        repoBase,
        prng,
      );
      return { spec, repoBase, root: root as FixtureBuild["root"] };
    }
  }
  const root = buildFromMock(repoBase, descriptor);
  return { spec, repoBase, root };
}

// ─── Named built-in fixtures ──────────────────────────────────────────────────

export const NAMED_FIXTURES: Record<string, FixtureSpec> = {
  "flat-30": {
    id: "flat-30",
    seed: 42,
    shape: "flat",
    params: { fileCount: 30, locPerFile: { mean: 24, stddev: 5 } } as unknown as Record<string, unknown>,
  },
  "deep-narrow": {
    id: "deep-narrow",
    seed: 42,
    shape: "deep",
    params: { depth: 8, filesPerLevel: 1, locPerFile: { mean: 25, stddev: 5 } } as unknown as Record<
      string,
      unknown
    >,
  },
  "wide-shallow": {
    id: "wide-shallow",
    seed: 42,
    shape: "wide",
    params: {
      fanout: 12,
      oversizeChildLoc: 1700,
      locPerFile: { mean: 200, stddev: 20 },
    } as unknown as Record<string, unknown>,
  },
  "boundary-1500": {
    id: "boundary-1500",
    seed: 42,
    shape: "boundary",
    params: { exactSubtreeLoc: 1500, siblingCount: 6 } as unknown as Record<string, unknown>,
  },
  "boundary-1499": {
    id: "boundary-1499",
    seed: 42,
    shape: "boundary",
    params: { exactSubtreeLoc: 1499, siblingCount: 6 } as unknown as Record<string, unknown>,
  },
  "boundary-1501": {
    id: "boundary-1501",
    seed: 42,
    shape: "boundary",
    params: { exactSubtreeLoc: 1501, siblingCount: 6 } as unknown as Record<string, unknown>,
  },
  "boundary-1700": {
    id: "boundary-1700",
    seed: 42,
    shape: "boundary",
    params: { exactSubtreeLoc: 1700, siblingCount: 6 } as unknown as Record<string, unknown>,
  },
};

export function listNamedFixtures(): Array<{ id: string; description: string }> {
  return [
    { id: "flat-30", description: "30 small files in one directory, total LOC ~720" },
    { id: "deep-narrow", description: "depth-8 tree, 1 file per level, ~200 LOC total" },
    { id: "wide-shallow", description: "fanout-12, one oversize child to force bins" },
    { id: "boundary-1500", description: "one directory at exact SPLIT_AT" },
    { id: "boundary-1499", description: "one directory just under SPLIT_AT" },
    { id: "boundary-1501", description: "one directory just over SPLIT_AT" },
    { id: "boundary-1700", description: "one directory at 1700 LOC — comfortably above SPLIT_AT, multiple bins" },
    { id: "real", description: "the host repo's src/ (no synthetic build)" },
  ];
}
