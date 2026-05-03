// Collision matrix: for every pair of agents, the leaves they share and the
// files they both touch. Per FR-009.

import { leafIdentity } from "./overlap.js";
import type { Allocation, AgentLoad, CollisionMatrix, CollisionPair, Leaf } from "./types.js";

function indexLeaves(leaves: Leaf[]): Map<string, Leaf> {
  const out = new Map<string, Leaf>();
  for (const l of leaves) out.set(leafIdentity(l), l);
  return out;
}

export function collisionMatrix(allocation: Allocation, leaves: Leaf[]): CollisionMatrix {
  const byId = indexLeaves(leaves);
  const pairs: CollisionPair[] = [];
  for (let a = 0; a < allocation.assignments.length; a++) {
    const aSet = new Set(allocation.assignments[a].leafIds);
    for (let b = a + 1; b < allocation.assignments.length; b++) {
      const bSet = new Set(allocation.assignments[b].leafIds);
      const sharedLeaves: string[] = [];
      for (const id of aSet) if (bSet.has(id)) sharedLeaves.push(id);
      if (sharedLeaves.length === 0) continue;
      const sharedFiles = new Set<string>();
      for (const id of sharedLeaves) {
        const leaf = byId.get(id);
        if (!leaf) continue;
        for (const f of leaf.files) sharedFiles.add(f);
      }
      pairs.push({
        agentA: allocation.assignments[a].agentId,
        agentB: allocation.assignments[b].agentId,
        sharedLeaves: sharedLeaves.sort(),
        sharedFiles: [...sharedFiles].sort(),
      });
    }
  }

  const agentLoad: AgentLoad[] = allocation.assignments.map((assn) => {
    const seenFiles = new Set<string>();
    let totalLoc = 0;
    for (const id of assn.leafIds) {
      const leaf = byId.get(id);
      if (!leaf) continue;
      for (const f of leaf.files) seenFiles.add(f);
      totalLoc += leaf.loc;
    }
    return {
      agentId: assn.agentId,
      leafCount: assn.leafIds.length,
      fileCount: seenFiles.size,
      totalLoc,
    };
  });

  return { pairs, agentLoad };
}
