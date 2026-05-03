// Full-report orchestrator: partition → optional mutation → second partition →
// overlap → drift → allocate → collide → visualise → balance → summary.

import { partitionTree } from "./core/partition-core.js";
import { applyMutation } from "./mutations.js";
import { checkOverlap } from "./overlap.js";
import { diffRuns } from "./drift.js";
import { allocate } from "./allocate.js";
import { collisionMatrix } from "./collide.js";
import { renderAscii } from "./visualise.js";
import { balanceMetrics } from "./balance.js";
import type { PartitionRun, ReportOptions, SimReport } from "./types.js";

const DETERMINISTIC_TS = "DETERMINISTIC";

function toRun(runId: string, fixtureId: string, seed: number, leaves: ReturnType<typeof partitionTree>): PartitionRun {
  return {
    runId,
    fixtureId,
    seed,
    leaves,
    totalLoc: leaves.reduce((a, l) => a + l.loc, 0),
    totalFiles: leaves.reduce((a, l) => a + l.files.length, 0),
    generatedAt: DETERMINISTIC_TS,
  };
}

function summaryLine(report: Omit<SimReport, "summary">): string {
  const violations: string[] = [];
  if (report.overlap.overlapCount > 0) {
    violations.push(`overlap=${report.overlap.overlapCount}`);
  }
  if (report.overlap.intraLeafDuplicates.length > 0) {
    violations.push(`intraLeafDuplicates=${report.overlap.intraLeafDuplicates.length}`);
  }
  if (report.collisions.pairs.length > 0) {
    violations.push(`collisions=${report.collisions.pairs.length}`);
  }
  if (violations.length === 0) return "clean";
  return `violations: ${violations.join(", ")}`;
}

export function report(opts: ReportOptions): SimReport {
  const { fixture, mutation, allocation: allocOpts } = opts;
  const baseLeaves = partitionTree(fixture.root, fixture.repoBase);
  const baseRun = toRun("T0", fixture.spec.id, fixture.spec.seed, baseLeaves);

  let runs: PartitionRun[] = [baseRun];
  let drift: SimReport["drift"] = null;
  let leavesForDownstream = baseLeaves;
  let rootForDownstream = fixture.root;

  if (mutation) {
    const mutated = applyMutation(fixture, mutation);
    const postLeaves = partitionTree(mutated.root, mutated.repoBase);
    const postRun = toRun("T1", fixture.spec.id, fixture.spec.seed, postLeaves);
    runs = [baseRun, postRun];
    drift = diffRuns(baseRun, postRun);
    leavesForDownstream = postLeaves;
    rootForDownstream = mutated.root;
  }

  const overlap = checkOverlap(leavesForDownstream);
  const allocation = allocate(leavesForDownstream, allocOpts);
  const collisions = collisionMatrix(allocation, leavesForDownstream);
  const visualisation = renderAscii(rootForDownstream, leavesForDownstream);
  const balance = balanceMetrics(leavesForDownstream);

  const partial: Omit<SimReport, "summary"> = {
    runs,
    overlap,
    drift,
    allocation,
    collisions,
    visualisation,
    balance,
  };
  return { ...partial, summary: summaryLine(partial) };
}

export function summarisePretty(r: SimReport): string {
  const fixtureId = r.runs[0]?.fixtureId ?? "(unknown)";
  const seed = r.runs[0]?.seed ?? "(unknown)";
  const mutationStr = r.runs.length > 1 ? `(applied)` : "none";
  const leafCount = r.runs[r.runs.length - 1]?.leaves.length ?? 0;
  const totalFiles = r.runs[r.runs.length - 1]?.totalFiles ?? 0;
  const totalLoc = r.runs[r.runs.length - 1]?.totalLoc ?? 0;
  const overlap = r.overlap.overlapCount === 0 ? "0      (safe)" : `${r.overlap.overlapCount}`;
  const driftStr = r.drift
    ? `files+${r.drift.filesAdded.length} files-${r.drift.filesRemoved.length} moved=${r.drift.filesMovedLeaf.length} renamed=${r.drift.filesRenamed.length} bins=${r.drift.binsRenumbered.length}`
    : "(n/a — single run)";
  const balanceStr =
    r.balance.verdict === "n/a"
      ? "n/a"
      : `${r.balance.verdict} (LOC max/min = ${r.balance.loc.maxOverMin?.toFixed(2) ?? "n/a"})`;

  return [
    `=== Sim Report ─ fixture=${fixtureId} seed=${seed} mutation=${mutationStr} ===`,
    `Runs        : ${r.runs.length}`,
    `Leaves      : ${leafCount}      Files: ${totalFiles}      LOC: ${totalLoc}`,
    `Overlap     : ${overlap}`,
    `Drift       : ${driftStr}`,
    `Allocation  : ${r.allocation.strategy} k=${r.allocation.k}`,
    `Collisions  : ${r.collisions.pairs.length} pairs`,
    `Balance     : ${balanceStr}`,
    `Summary     : ${r.summary}`,
  ].join("\n");
}
