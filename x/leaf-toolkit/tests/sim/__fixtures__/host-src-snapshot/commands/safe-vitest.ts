// `leaf safe-vitest` — convenience preset over `leaf safe-tool` for the
// most common case: running vitest with a system-wide cap so parallel
// agent loops don't saturate RAM.
//
// Equivalent to:
//   leaf safe-tool --cap ${SAFE_VITEST_CAP:-8} --match vitest -- <vitest-bin> <args>
//
// Honours env vars:
//   SAFE_VITEST_CAP   default cap (8)
//   SAFE_VITEST_POLL  pgrep poll seconds (3)
//   SAFE_VITEST_FLOCK if set, becomes the --flock-dir for true semaphore
//
// Forward unknown args after `--` straight to vitest. If no `--` is given,
// all args go to vitest.

import { safeTool } from "./safe-tool.js";
import { findBin } from "../find-bin.js";

export async function safeVitest(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      "Usage: leaf safe-vitest [-- <vitest args…>]\n\n" +
        "Preset: --cap=$SAFE_VITEST_CAP (default 8) --match vitest -- <vitest-bin> <args>.\n" +
        "Use $SAFE_VITEST_FLOCK=/tmp/leaf-vitest-locks for the flock backend.\n",
    );
    return;
  }
  const vitestBin = findBin("vitest");
  if (!vitestBin) {
    process.stderr.write(
      "leaf safe-vitest: vitest not found in any ancestor node_modules/.bin — install it as a dev dep\n",
    );
    process.exit(1);
  }
  // Strip leading `--` if present; safe-tool reinserts its own.
  const vitestArgs = argv[0] === "--" ? argv.slice(1) : argv;
  const cap = process.env.SAFE_VITEST_CAP ?? "8";
  const poll = process.env.SAFE_VITEST_POLL ?? "3";
  const flockDir = process.env.SAFE_VITEST_FLOCK;
  const compoundArgs = [
    "--cap",
    cap,
    "--match",
    "vitest",
    "--poll",
    poll,
    ...(flockDir ? ["--flock-dir", flockDir] : []),
    "--",
    vitestBin,
    ...vitestArgs,
  ];
  await safeTool(compoundArgs);
}
