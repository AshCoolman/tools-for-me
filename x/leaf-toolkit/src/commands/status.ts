// `leaf status <domain> [flags]` — print every leaf's priority + status for
// one domain, sorted p0 first then by gap-from-target descending.
//
// Currently implemented: `coverage`.
// Reads each leaf's LEAF.priority[.bin-N].md (priority) and
// LEAF.coverage[.bin-N].md (status). Output: text table or JSON.

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "../repo-root.js";

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  normal: 3,
  low: 4,
  lowest: 5,
};
const PRIORITY_SHORT: Record<string, string> = {
  critical: "p0",
  high: "p1",
  medium: "p2",
  normal: "p3",
  low: "p4",
  lowest: "p5",
};

interface ManifestLeaf {
  path: string;
  scope: "subtree" | "bin";
  binIndex?: number;
  binTotal?: number;
  files: string[];
  loc: number;
}

interface Row {
  priority: string;
  prioRank: number;
  prioShort: string;
  pkg: string;
  notesRel: string;
  leafPath: string;
  loc: number;
  files: number;
  linesPct: number | null;
  branchesPct: number | null;
  funcsPct: number | null;
  stmtsPct: number | null;
  gap: number | null;
  hint: string | null;
}

function fail(msg: string): never {
  process.stderr.write(`FAIL: ${msg}\n`);
  process.exit(1);
}

function leafDocPath(REPO: string, leaf: ManifestLeaf, domain: string): string {
  const suffix =
    leaf.binIndex !== undefined && leaf.binIndex !== null ? `.bin-${leaf.binIndex}` : "";
  return join(REPO, leaf.path, `LEAF.${domain}${suffix}.md`);
}

function parsePriority(txt: string): string {
  const m = txt.match(/^priority:\s*([A-Za-z]+)\s*$/m);
  if (!m) return "(unset)";
  const v = m[1].toLowerCase();
  return v === "unset" ? "(unset)" : v;
}

function parseCoverage(txt: string): {
  pkg: string;
  linesPct: number | null;
  branchesPct: number | null;
  funcsPct: number | null;
  stmtsPct: number | null;
  hint: string | null;
} {
  let pkg = "(unknown)";
  let linesPct: number | null = null;
  let branchesPct: number | null = null;
  let funcsPct: number | null = null;
  let stmtsPct: number | null = null;
  let hint: string | null = null;
  const pkgM = txt.match(/\*\*Package\*\*:\s*`([^`]+)`/);
  if (pkgM) pkg = pkgM[1];
  const sumM = txt.match(
    /\*\*Summary\*\*:\s*lines\s+([0-9.]+)%[\s\S]*?branches\s+([0-9.]+)%[\s\S]*?funcs\s+([0-9.]+)%[\s\S]*?stmts\s+([0-9.]+)%/,
  );
  if (sumM) {
    linesPct = Number(sumM[1]);
    branchesPct = Number(sumM[2]);
    funcsPct = Number(sumM[3]);
    stmtsPct = Number(sumM[4]);
  } else {
    const hintM = txt.match(/\*\*Note\*\*:\s*([^\n]+)/);
    if (hintM) hint = hintM[1].trim();
    else hint = "no parsable summary";
  }
  return { pkg, linesPct, branchesPct, funcsPct, stmtsPct, hint };
}

const METRIC_NAMES = ["lines", "branches", "funcs", "stmts"] as const;

function metricValue(row: Row, metric: string): number | null {
  switch (metric) {
    case "lines":
      return row.linesPct;
    case "branches":
      return row.branchesPct;
    case "funcs":
      return row.funcsPct;
    case "stmts":
      return row.stmtsPct;
    case "all": {
      const vals = [row.linesPct, row.branchesPct, row.funcsPct, row.stmtsPct];
      if (vals.some((v) => v === null)) return null;
      return Math.min(...(vals as number[]));
    }
    default:
      return row.linesPct;
  }
}

function loadRows(REPO: string, metric: string, target: number): Row[] {
  const MANIFEST = join(REPO, "leaves.gitignored.json");
  if (!existsSync(MANIFEST)) {
    fail(`missing ${relative(REPO, MANIFEST)} — run \`leaf partition\` first`);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8")) as {
    leaves?: ManifestLeaf[];
  };
  if (!manifest.leaves || manifest.leaves.length === 0) {
    fail(`no leaves in manifest — run \`leaf partition\` first`);
  }
  const rows: Row[] = [];
  for (const leaf of manifest.leaves) {
    const priorityAbs = leafDocPath(REPO, leaf, "priority");
    const coverageAbs = leafDocPath(REPO, leaf, "coverage");
    const notesRel = relative(REPO, priorityAbs);
    const priorityTxt = existsSync(priorityAbs) ? readFileSync(priorityAbs, "utf-8") : "";
    const coverageTxt = existsSync(coverageAbs) ? readFileSync(coverageAbs, "utf-8") : "";
    if (!priorityTxt && !coverageTxt) continue;
    const priority = parsePriority(priorityTxt);
    const cov = coverageTxt
      ? parseCoverage(coverageTxt)
      : {
          pkg: "(unknown)",
          linesPct: null,
          branchesPct: null,
          funcsPct: null,
          stmtsPct: null,
          hint: "no LEAF.coverage.md — run `leaf link coverage`",
        };
    const row: Row = {
      priority,
      prioRank: PRIORITY_RANK[priority] ?? 99,
      prioShort: PRIORITY_SHORT[priority] ?? "—",
      pkg: cov.pkg,
      notesRel,
      leafPath: leaf.path,
      loc: leaf.loc,
      files: leaf.files.length,
      linesPct: cov.linesPct,
      branchesPct: cov.branchesPct,
      funcsPct: cov.funcsPct,
      stmtsPct: cov.stmtsPct,
      gap: null,
      hint: cov.hint,
    };
    const v = metricValue(row, metric);
    row.gap = v === null ? null : Math.max(0, target - v);
    rows.push(row);
  }
  rows.sort((a, b) => {
    if (a.prioRank !== b.prioRank) return a.prioRank - b.prioRank;
    const ag = a.gap ?? -1;
    const bg = b.gap ?? -1;
    return bg - ag;
  });
  return rows;
}

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

function padNum(v: number | null, n: number): string {
  if (v === null) return "    —".padEnd(n);
  return v.toFixed(1).padStart(n);
}

function printTable(rows: Row[], metric: string, target: number): void {
  const header =
    `${pad("PRIO", 4)}  ${pad("LEAF", 60)}  ${pad("LOC", 5)}  ${pad("F", 3)}  ${pad("L%", 6)}  ${pad("B%", 6)}  ${pad("F%", 6)}  GAP`;
  process.stdout.write(`Target: ${target}% (${metric})\n\n`);
  process.stdout.write(header + "\n");
  process.stdout.write("-".repeat(header.length) + "\n");
  for (const r of rows) {
    const gap = r.gap === null ? "  —" : r.gap.toFixed(1).padStart(5);
    const leaf = r.leafPath.length > 60 ? "…" + r.leafPath.slice(-59) : r.leafPath;
    process.stdout.write(
      `${pad(r.prioShort, 4)}  ${pad(leaf, 60)}  ${pad(r.loc, 5)}  ${pad(r.files, 3)}  ${padNum(r.linesPct, 6)}  ${padNum(r.branchesPct, 6)}  ${padNum(r.funcsPct, 6)}  ${gap}\n`,
    );
    if (r.hint) process.stdout.write(`      ${pad("", 4)}  note: ${r.hint}\n`);
  }
  process.stdout.write(`\n${rows.length} leaves listed\n`);
}

async function statusCoverage(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      "Usage: leaf status coverage [--target <pct>] [--below-target] [--metric all|lines|branches|funcs|stmts] [--json]\n",
    );
    return;
  }
  let target = 80;
  let belowOnly = false;
  let metric = "all";
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--target") {
      const v = argv[++i];
      if (!v || !/^[0-9.]+$/.test(v))
        fail(`--target needs a number (got ${v ?? "nothing"})`);
      target = Number(v);
    } else if (a === "--below-target") {
      belowOnly = true;
    } else if (a === "--metric") {
      metric = argv[++i] ?? "";
      if (!["all", ...METRIC_NAMES].includes(metric)) {
        fail(`--metric must be all|lines|branches|funcs|stmts (got ${metric})`);
      }
    } else if (a === "--json") {
      json = true;
    } else if (a !== "--help" && a !== "-h") {
      fail(`unknown arg: ${a}`);
    }
  }
  const REPO = repoRoot();
  let rows = loadRows(REPO, metric, target);
  if (belowOnly) {
    rows = rows.filter((r) => {
      const v = metricValue(r, metric);
      return v === null || v < target;
    });
  }
  if (json) {
    process.stdout.write(
      JSON.stringify({ target, metric, count: rows.length, rows }, null, 2) + "\n",
    );
    return;
  }
  printTable(rows, metric, target);
}

export async function status(argv: string[]): Promise<void> {
  const [domain, ...rest] = argv;
  if (!domain) {
    throw new Error(
      "usage: leaf status <domain> [--target N] [--metric M] [--below-target] [--json]",
    );
  }
  if (domain === "coverage") {
    await statusCoverage(rest);
    return;
  }
  throw new Error(
    `domain "${domain}" not yet built-in — register a custom DomainPlugin via \`leaf domain register ${domain}\`.`,
  );
}
