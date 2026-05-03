// Standalone runner for `leaf sim`. Subcommands: report, baseline, list-fixtures.
// Per specs/001-leaf-allocation-sim/contracts/cli.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { repoRoot } from "../repo-root.js";
import { buildFromFs } from "./core/dirnode.js";
import { buildFixture, listNamedFixtures, NAMED_FIXTURES } from "./fixtures.js";
import { applyMutation } from "./mutations.js";
import { report, summarisePretty } from "./report.js";
import type { AllocationStrategy, FixtureBuild, Mutate, ReportOptions } from "./types.js";

interface ReportFlags {
  fixture: string;
  seed: number;
  mutate: Mutate[];
  k: number;
  strategy: AllocationStrategy;
  out?: string;
  json: boolean;
}

function parseInt10(s: string, fieldName: string): number {
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) throw new Error(`expected integer for ${fieldName}, got '${s}'`);
  return n;
}

function parseStrategy(s: string): AllocationStrategy {
  const valid: AllocationStrategy[] = ["round-robin", "random-uniform", "random-uniform-rep", "priority-weighted"];
  if (!valid.includes(s as AllocationStrategy)) {
    throw new Error(`unknown strategy '${s}'; valid: ${valid.join(", ")}`);
  }
  return s as AllocationStrategy;
}

function parseMutation(spec: string): Mutate {
  const parts = spec.split(":");
  const kind = parts[0];
  switch (kind) {
    case "add":
      if (parts.length !== 3) throw new Error(`add mutation: expected add:<path>:<loc>`);
      return { kind: "addFile", path: parts[1], loc: parseInt10(parts[2], "loc") };
    case "grow":
      if (parts.length !== 3) throw new Error(`grow mutation: expected grow:<path>:<delta>`);
      return { kind: "growFile", path: parts[1], deltaLoc: parseInt10(parts[2], "delta") };
    case "remove":
      if (parts.length !== 2) throw new Error(`remove mutation: expected remove:<path>`);
      return { kind: "removeFile", path: parts[1] };
    case "rename":
      if (parts.length !== 3) throw new Error(`rename mutation: expected rename:<from>:<to>`);
      return { kind: "renameFile", fromPath: parts[1], toPath: parts[2] };
    case "move":
      if (parts.length !== 3) throw new Error(`move mutation: expected move:<path>:<toDir>`);
      return { kind: "moveFile", path: parts[1], toDir: parts[2] };
    default:
      throw new Error(`unknown mutation kind '${kind}'`);
  }
}

function parseReportFlags(argv: string[]): ReportFlags {
  const flags: ReportFlags = {
    fixture: "flat-30",
    seed: 42,
    mutate: [],
    k: 4,
    strategy: "round-robin",
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case "--fixture":
        flags.fixture = next;
        i++;
        break;
      case "--seed":
        flags.seed = parseInt10(next, "seed");
        i++;
        break;
      case "--mutate":
        flags.mutate.push(parseMutation(next));
        i++;
        break;
      case "--k":
        flags.k = parseInt10(next, "k");
        i++;
        break;
      case "--strategy":
        flags.strategy = parseStrategy(next);
        i++;
        break;
      case "--out":
        flags.out = next;
        i++;
        break;
      case "--json":
        flags.json = true;
        break;
      default:
        throw new Error(`unknown flag '${a}'`);
    }
  }
  return flags;
}

function buildFixtureForRun(name: string, seed: number): FixtureBuild {
  if (name === "real") {
    const REPO = repoRoot();
    const srcAbs = join(REPO, "src");
    const root = buildFromFs(srcAbs);
    return {
      spec: { id: "real", seed, shape: "custom", params: {} },
      repoBase: REPO,
      root,
    };
  }
  const spec = NAMED_FIXTURES[name];
  if (!spec) throw new Error(`unknown fixture '${name}'`);
  return buildFixture({ ...spec, seed });
}

function reportCommand(argv: string[]): number {
  const flags = parseReportFlags(argv);
  const fixture = buildFixtureForRun(flags.fixture, flags.seed);
  let working = fixture;
  // Mutations are applied in order before the partition+report pipeline.
  // Each mutation produces a new FixtureBuild; the report() helper does a
  // single mutation step internally for drift, so we pre-apply all but one.
  if (flags.mutate.length > 1) {
    for (let i = 0; i < flags.mutate.length - 1; i++) {
      working = applyMutation(working, flags.mutate[i]);
    }
  }
  const reportOpts: ReportOptions = {
    fixture: working,
    mutation: flags.mutate.length > 0 ? flags.mutate[flags.mutate.length - 1] : undefined,
    allocation: { strategy: flags.strategy, k: flags.k, seed: flags.seed },
  };
  const r = report(reportOpts);

  if (flags.out) {
    mkdirSync(flags.out, { recursive: true });
    writeFileSync(join(flags.out, "overlap.txt"), JSON.stringify(r.overlap, null, 2) + "\n");
    writeFileSync(
      join(flags.out, r.drift ? "drift.txt" : "drift-self.txt"),
      JSON.stringify(r.drift ?? { note: "single run — no drift computed" }, null, 2) + "\n",
    );
    writeFileSync(
      join(flags.out, `allocation-${r.allocation.strategy}-k${r.allocation.k}.txt`),
      JSON.stringify({ allocation: r.allocation, collisions: r.collisions }, null, 2) + "\n",
    );
    writeFileSync(join(flags.out, "visualisation.txt"), r.visualisation + "\n");
    writeFileSync(join(flags.out, "metrics.txt"), JSON.stringify(r.balance, null, 2) + "\n");
    writeFileSync(join(flags.out, "summary.txt"), r.summary + "\n");
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  } else {
    process.stdout.write(summarisePretty(r) + "\n");
  }
  return r.summary === "clean" ? 0 : 1;
}

function baselineCommand(_argv: string[]): number {
  const REPO = repoRoot();
  const outDir = resolve(REPO, "specs/001-leaf-allocation-sim/baseline");
  const code = reportCommand([
    "--fixture",
    "real",
    "--seed",
    "42",
    "--strategy",
    "round-robin",
    "--k",
    "4",
    "--out",
    outDir,
  ]);
  process.stdout.write(`\nWrote baseline to ${outDir}\n`);
  return code;
}

function listFixturesCommand(): number {
  for (const f of listNamedFixtures()) {
    process.stdout.write(`${f.id.padEnd(14)} ${f.description}\n`);
  }
  return 0;
}

export async function sim(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;
  let code = 0;
  switch (sub) {
    case "report":
      code = reportCommand(rest);
      break;
    case "baseline":
      code = baselineCommand(rest);
      break;
    case "list-fixtures":
      code = listFixturesCommand();
      break;
    default:
      process.stderr.write(
        "leaf sim <subcommand> [flags]\n\n" +
          "subcommands:\n" +
          "  report      Run the full report pipeline against one fixture\n" +
          "  baseline    Run the report against the host repo's real src/\n" +
          "  list-fixtures  List the named built-in fixtures\n",
      );
      code = 2;
  }
  if (code !== 0) process.exit(code);
}
