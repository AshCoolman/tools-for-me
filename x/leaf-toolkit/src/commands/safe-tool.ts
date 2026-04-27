// `leaf safe-tool` — run a heavy command under a system-wide concurrency cap.
//
// Two backends:
//   pgrep  (default, portable): poll how many sibling procs match a pattern.
//   flock  (linux/macos with util-linux flock): N file locks act as a counted
//          semaphore — no busy-poll.
//
// Usage:
//   leaf safe-tool --cap 8 --match vitest -- vitest run --coverage
//   leaf safe-tool --cap 4 --match playwright --flock-dir /tmp/leaf-locks -- playwright test
//
// The trailing command runs in the consumer's PATH context — invoke via your
// package manager's run-script (e.g. `yarn leaf safe-tool ...`) so
// node_modules/.bin is on PATH.
//
// Flags:
//   --cap N             hard cap on simultaneous matching procs (default 8)
//   --match REGEX       proc-argv pattern to count (default: first cmd word)
//   --poll SECS         pgrep backend poll interval (default 3)
//   --timeout SECS      give up after this many seconds waiting (default 600)
//   --flock-dir PATH    use flock semaphore in PATH (creates if absent)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

interface Args {
  cap: number;
  match: string;
  poll: number;
  timeout: number;
  flockDir: string | null;
  cmd: string[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    cap: Number(process.env.LEAF_SAFE_TOOL_CAP ?? 8),
    match: "",
    poll: 3,
    timeout: 600,
    flockDir: null,
    cmd: [],
  };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      out.cmd = argv.slice(i + 1);
      break;
    }
    const next = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      i++;
      return v;
    };
    if (a === "--cap") out.cap = Number(next());
    else if (a === "--match") out.match = next();
    else if (a === "--poll") out.poll = Number(next());
    else if (a === "--timeout") out.timeout = Number(next());
    else if (a === "--flock-dir") out.flockDir = next();
    else throw new Error(`unknown flag: ${a}`);
    i++;
  }
  if (out.cmd.length === 0) throw new Error("missing -- <cmd…>");
  if (!out.match) out.match = out.cmd[0];
  return out;
}

function pgrepCount(pattern: string): number {
  const r = spawnSync("pgrep", ["-af", pattern], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return 0;
  // Strip our own wrapper from the count.
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .filter((l) => !l.includes("leaf safe-tool"))
    .length;
}

async function pgrepWait(args: Args): Promise<void> {
  const start = Date.now();
  while (true) {
    const n = pgrepCount(args.match);
    if (n < args.cap) return;
    if ((Date.now() - start) / 1000 >= args.timeout) {
      throw new Error(`safe-tool: still ${n} matching procs after ${args.timeout}s`);
    }
    await new Promise((r) => setTimeout(r, args.poll * 1000));
  }
}

function flockExec(args: Args): never {
  // Flock backend: N lock files, acquire any one. Counter is implicit in the
  // file pool size. Requires `flock` on PATH (linux util-linux, or
  // homebrew `flock` on macos).
  const dir = args.flockDir!;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Random ordering so contending callers don't all probe slot 0 first.
  const order = Array.from({ length: args.cap }, (_, k) => k).sort(() => Math.random() - 0.5);
  // Build a chain: try each slot non-blocking; the last one is blocking so we
  // eventually wait if nothing's free.
  const probes = order.slice(0, -1).map((k) => `flock -n "${dir}/slot-${k}.lock" -c '`);
  const last = order[order.length - 1];
  const tail = `flock "${dir}/slot-${last}.lock" -c 'exec "$@"' _ ${args.cmd.map((c) => `'${c.replace(/'/g, "'\\''")}'`).join(" ")}`;
  const close = ")".repeat(probes.length).replace(/\)/g, "'");
  const script = `${probes.join("")}${tail}${close}`;
  const child = spawn("bash", ["-c", script], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
  // Unreachable; keep TS happy.
  throw new Error("flockExec spawn returned");
}

export async function safeTool(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.flockDir) {
    flockExec(args);
    return;
  }
  await pgrepWait(args);
  const child = spawn(args.cmd[0], args.cmd.slice(1), { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
}
