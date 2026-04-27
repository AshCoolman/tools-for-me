// `leaf survey` — run every workspace's tests with coverage in token-efficient
// text form. Writes per-package output to coverage-survey.gitignored/<pkg>.txt
// and a summary table to coverage-survey.gitignored/_summary.md.
//
// Sequential by default (coverage runs are heavy). Pair with `leaf safe-tool`
// or workspace-level concurrency caps when running alongside agent loops.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "../repo-root.js";

const PKG_TIMEOUT_MS = 10 * 60 * 1000;

interface Workspace {
  name: string;
  dir: string;
  runner: "vitest" | "jest" | null;
  testScript: string | null;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function expandWorkspaces(REPO: string): string[] {
  const root = readJson(join(REPO, "package.json"));
  const patterns: string[] = root.workspaces || [];
  const dirs: string[] = [];
  for (const p of patterns) {
    if (p.endsWith("/*")) {
      const base = join(REPO, p.slice(0, -2));
      if (!existsSync(base)) continue;
      for (const e of readdirSync(base, { withFileTypes: true })) {
        if (e.isDirectory()) dirs.push(join(base, e.name));
      }
    } else {
      dirs.push(join(REPO, p));
    }
  }
  return dirs.filter((d) => existsSync(join(d, "package.json")));
}

function inspectWorkspace(REPO: string, dir: string): Workspace {
  const pkg = readJson(join(dir, "package.json"));
  const testScript: string | null = pkg.scripts?.test ?? null;
  const allDeps: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  let runner: Workspace["runner"] = null;
  if (allDeps["vitest"] || (testScript && /\bvitest\b/.test(testScript))) runner = "vitest";
  else if (allDeps["jest"] || (testScript && /\bjest\b/.test(testScript))) runner = "jest";
  return { name: pkg.name ?? relative(REPO, dir), dir, runner, testScript };
}

function runCoverage(ws: Workspace): {
  ok: boolean;
  output: string;
  durationMs: number;
} {
  const start = Date.now();
  let cmd: string;
  let args: string[];
  if (ws.runner === "vitest") {
    cmd = "yarn";
    args = [
      "vitest",
      "run",
      "--coverage",
      "--coverage.reporter=text",
      "--coverage.reporter=text-summary",
      "--passWithNoTests",
    ];
  } else if (ws.runner === "jest") {
    cmd = "yarn";
    args = [
      "jest",
      "--coverage",
      "--coverageReporters=text",
      "--coverageReporters=text-summary",
      "--passWithNoTests",
    ];
  } else {
    return { ok: false, output: "(no recognised test runner)\n", durationMs: 0 };
  }
  const res = spawnSync(cmd, args, {
    cwd: ws.dir,
    encoding: "utf-8",
    env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    timeout: PKG_TIMEOUT_MS,
    maxBuffer: 100 * 1024 * 1024,
  });
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  const output = stderr ? `${stdout}\n--- STDERR ---\n${stderr}` : stdout;
  return { ok: res.status === 0, output, durationMs: Date.now() - start };
}

function safeName(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, "_");
}

export async function survey(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      "Usage: leaf survey [--only=<substring>]\n\n" +
        "Run each workspace's tests with coverage. Output text-summary blocks\n" +
        "into coverage-survey.gitignored/<pkg>.txt for `leaf link coverage` to read.\n",
    );
    return;
  }
  const REPO = repoRoot();
  const OUT_DIR = join(REPO, "coverage-survey.gitignored");
  mkdirSync(OUT_DIR, { recursive: true });
  const workspaces = expandWorkspaces(REPO).map((d) => inspectWorkspace(REPO, d));

  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length) : null;
  const filtered = only
    ? workspaces.filter((w) => w.name.includes(only) || w.dir.includes(only))
    : workspaces;

  const rows: string[] = [];
  for (const ws of filtered) {
    const sn = safeName(ws.name);
    if (!ws.runner) {
      rows.push(`| \`${ws.name}\` | none | skipped | — | — |`);
      writeFileSync(
        join(OUT_DIR, `${sn}.txt`),
        `(no test runner detected for ${ws.name})\n`,
      );
      process.stderr.write(`· ${ws.name} — no runner, skipped\n`);
      continue;
    }
    process.stderr.write(`→ ${ws.name} [${ws.runner}] ...\n`);
    const r = runCoverage(ws);
    writeFileSync(join(OUT_DIR, `${sn}.txt`), r.output);
    const status = r.ok ? "pass" : "fail";
    const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
    rows.push(`| \`${ws.name}\` | ${ws.runner} | ${status} | ${dur} | \`${sn}.txt\` |`);
    process.stderr.write(`  ${status} in ${dur}\n`);
  }

  const summary = [
    `# Coverage survey  (${new Date().toISOString()})`,
    "",
    "| Package | Runner | Status | Duration | Output |",
    "|---------|--------|--------|----------|--------|",
    ...rows,
    "",
  ].join("\n");

  writeFileSync(join(OUT_DIR, "_summary.md"), summary);
  process.stdout.write(summary);
  process.stdout.write(`Outputs: ${relative(REPO, OUT_DIR)}/\n`);
}
