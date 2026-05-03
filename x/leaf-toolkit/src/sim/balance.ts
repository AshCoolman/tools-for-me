// Balance metrics across leaves (FR-011). Mean, stddev, min, max, max/min ratio
// over LOC and file count. Verdict thresholds: well-balanced ≤ 1.5,
// skewed ≤ 3, unbalanced > 3, n/a for ≤ 1 leaves.

import type { BalanceReport, Leaf, Stats } from "./types.js";

function stats(values: number[]): Stats {
  if (values.length === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0, maxOverMin: null };
  }
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const maxOverMin = min === 0 ? null : max / min;
  return { mean, stddev, min, max, maxOverMin };
}

function verdictFromRatio(ratio: number | null): BalanceReport["verdict"] {
  if (ratio === null) return "skewed";
  if (ratio <= 1.5) return "well-balanced";
  if (ratio <= 3) return "skewed";
  return "unbalanced";
}

export function balanceMetrics(leaves: Leaf[]): BalanceReport {
  if (leaves.length <= 1) {
    return {
      leafCount: leaves.length,
      totalLoc: leaves.reduce((a, l) => a + l.loc, 0),
      totalFiles: leaves.reduce((a, l) => a + l.files.length, 0),
      loc: stats(leaves.map((l) => l.loc)),
      files: stats(leaves.map((l) => l.files.length)),
      verdict: "n/a",
    };
  }
  const loc = stats(leaves.map((l) => l.loc));
  const files = stats(leaves.map((l) => l.files.length));
  return {
    leafCount: leaves.length,
    totalLoc: leaves.reduce((a, l) => a + l.loc, 0),
    totalFiles: leaves.reduce((a, l) => a + l.files.length, 0),
    loc,
    files,
    verdict: verdictFromRatio(loc.maxOverMin),
  };
}
