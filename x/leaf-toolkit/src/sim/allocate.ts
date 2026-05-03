// Allocate K agents across leaves under one of four strategies (FR-008).
// All seeded for determinism via the mulberry32 PRNG.

import { makePrng } from "./prng.js";
import { leafIdentity } from "./overlap.js";
import type { Allocation, AllocateOptions, Leaf } from "./types.js";

function shuffleInPlace<T>(arr: T[], prng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function emptyAssignments(k: number): Array<{ agentId: number; leafIds: string[] }> {
  return Array.from({ length: k }, (_, i) => ({ agentId: i, leafIds: [] }));
}

function roundRobin(leaves: Leaf[], k: number): Array<{ agentId: number; leafIds: string[] }> {
  const out = emptyAssignments(k);
  const ids = leaves.map(leafIdentity);
  for (let i = 0; i < ids.length; i++) {
    out[i % k].leafIds.push(ids[i]);
  }
  return out;
}

function randomUniformNoReplacement(
  leaves: Leaf[],
  k: number,
  seed: number,
): Array<{ agentId: number; leafIds: string[] }> {
  const prng = makePrng(seed);
  const out = emptyAssignments(k);
  const ids = leaves.map(leafIdentity);
  shuffleInPlace(ids, prng);
  for (let i = 0; i < ids.length; i++) {
    out[i % k].leafIds.push(ids[i]);
  }
  return out;
}

function randomUniformWithReplacement(
  leaves: Leaf[],
  k: number,
  seed: number,
): Array<{ agentId: number; leafIds: string[] }> {
  const prng = makePrng(seed);
  const out = emptyAssignments(k);
  const ids = leaves.map(leafIdentity);
  if (ids.length === 0) return out;
  // Each agent gets ceil(n/k) leaves drawn with replacement from ids.
  const perAgent = Math.max(1, Math.ceil(ids.length / k));
  for (let a = 0; a < k; a++) {
    for (let i = 0; i < perAgent; i++) {
      const idx = Math.floor(prng() * ids.length);
      out[a].leafIds.push(ids[idx]);
    }
  }
  return out;
}

function priorityWeighted(
  leaves: Leaf[],
  k: number,
  seed: number,
  priorityOf: (leafId: string) => number,
): Array<{ agentId: number; leafIds: string[] }> {
  const prng = makePrng(seed);
  const out = emptyAssignments(k);
  const ids = leaves.map(leafIdentity).filter((id) => priorityOf(id) > 0);
  if (ids.length === 0) return out;
  const weights = ids.map(priorityOf);
  const totalWeight = weights.reduce((a, w) => a + w, 0);
  // Each agent gets ceil(n/k) draws weighted by priority. Without replacement
  // is hard with weighted sampling; we use with-replacement weighted draws.
  const perAgent = Math.max(1, Math.ceil(ids.length / k));
  for (let a = 0; a < k; a++) {
    for (let i = 0; i < perAgent; i++) {
      let r = prng() * totalWeight;
      let pickIdx = ids.length - 1;
      for (let j = 0; j < ids.length; j++) {
        r -= weights[j];
        if (r <= 0) {
          pickIdx = j;
          break;
        }
      }
      out[a].leafIds.push(ids[pickIdx]);
    }
  }
  return out;
}

export function allocate(leaves: Leaf[], opts: AllocateOptions): Allocation {
  const { strategy, k, seed } = opts;
  let assignments: Array<{ agentId: number; leafIds: string[] }>;
  switch (strategy) {
    case "round-robin":
      assignments = roundRobin(leaves, k);
      break;
    case "random-uniform":
      assignments = randomUniformNoReplacement(leaves, k, seed);
      break;
    case "random-uniform-rep":
      assignments = randomUniformWithReplacement(leaves, k, seed);
      break;
    case "priority-weighted":
      if (!opts.priorityOf) {
        throw new Error("priority-weighted strategy requires opts.priorityOf");
      }
      assignments = priorityWeighted(leaves, k, seed, opts.priorityOf);
      break;
  }
  return { strategy, seed, k, assignments };
}
