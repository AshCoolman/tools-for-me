// `leaf link <domain>` — refresh LEAF.<domain>[.bin-N].md for every leaf.
//
// Currently implemented: `coverage` — reads coverage-survey.gitignored/<pkg>.txt
// (produced by `leaf survey`) and writes a per-leaf LEAF.coverage.md with
// frontmatter, package link, and parsed text-summary block.

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { repoRoot } from "../repo-root.js";

interface ManifestLeaf {
  path: string;
  scope: "subtree" | "bin";
  binIndex?: number;
  binTotal?: number;
  files: string[];
  loc: number;
}

interface Workspace {
  relDir: string;
  pkgName: string;
}

function fail(msg: string): never {
  process.stderr.write(`FAIL: ${msg}\n`);
  process.exit(1);
}

function coverageDocPath(REPO: string, leaf: ManifestLeaf): string {
  const suffix =
    leaf.binIndex !== undefined && leaf.binIndex !== null ? `.bin-${leaf.binIndex}` : "";
  return join(REPO, leaf.path, `LEAF.coverage${suffix}.md`);
}

function loadWorkspaces(REPO: string): Workspace[] {
  const ROOT_PKG = join(REPO, "package.json");
  const raw = JSON.parse(readFileSync(ROOT_PKG, "utf-8")) as {
    workspaces?: string[] | { packages?: string[] };
  };
  const patterns = Array.isArray(raw.workspaces)
    ? raw.workspaces
    : raw.workspaces?.packages ?? [];
  const out: Workspace[] = [];
  const seen = new Set<string>();
  for (const pattern of patterns) {
    const m = pattern.match(/^(.*?)\/\*$/);
    const parents = m ? [m[1]] : [pattern];
    for (const parent of parents) {
      const parentAbs = join(REPO, parent);
      if (!existsSync(parentAbs)) continue;
      let entries: string[];
      try {
        entries = readdirSync(parentAbs);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const dir = join(parentAbs, entry);
        const pkgJson = join(dir, "package.json");
        if (!existsSync(pkgJson)) continue;
        let s: ReturnType<typeof statSync>;
        try {
          s = statSync(dir);
        } catch {
          continue;
        }
        if (!s.isDirectory()) continue;
        const pkg = JSON.parse(readFileSync(pkgJson, "utf-8")) as { name?: string };
        if (!pkg.name) continue;
        const relDir = relative(REPO, dir);
        if (seen.has(relDir)) continue;
        seen.add(relDir);
        out.push({ relDir, pkgName: pkg.name });
      }
    }
  }
  out.sort((a, b) => b.relDir.length - a.relDir.length);
  return out;
}

function workspaceForLeaf(
  leafPath: string,
  workspaces: Workspace[],
): Workspace | null {
  for (const w of workspaces) {
    if (leafPath === w.relDir || leafPath.startsWith(w.relDir + "/")) return w;
  }
  return null;
}

function coverageFileFor(REPO: string, pkgName: string): string {
  // `@scope/name` → `_scope_name.txt`; unscoped → `<name>.txt`.
  const sanitized = pkgName.replace(/@/g, "_").replace(/\//g, "_");
  return join(REPO, "coverage-survey.gitignored", `${sanitized}.txt`);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

interface Summary {
  statements?: string;
  branches?: string;
  functions?: string;
  lines?: string;
}

function parseSummary(raw: string): Summary | null {
  const txt = stripAnsi(raw);
  const idx = txt.lastIndexOf("Coverage summary");
  if (idx < 0) return null;
  const tail = txt.slice(idx);
  const grab = (label: string): string | undefined => {
    const re = new RegExp(`${label}\\s*:\\s*([0-9.]+%[^\\n]*)`, "i");
    const m = tail.match(re);
    return m ? m[1].trim() : undefined;
  };
  return {
    statements: grab("Statements"),
    branches: grab("Branches"),
    functions: grab("Functions"),
    lines: grab("Lines"),
  };
}

function buildCoverageBody(opts: {
  leafRel: string;
  pkgName: string;
  coverageRel: string | null;
  summary: Summary | null;
  hint: string | null;
}): string {
  const lines: string[] = [];
  lines.push(
    `---\ndomain: coverage\nleafPath: ${opts.leafRel.replace(/\/LEAF\.coverage(\.bin-\d+)?\.md$/, "")}\npkg: ${opts.pkgName}\n---\n`,
  );
  lines.push("");
  lines.push(`# Coverage — \`${opts.leafRel}\``);
  lines.push("");
  if (!opts.coverageRel) {
    lines.push(`- **Source**: _no coverage file found_ — run \`leaf survey\``);
    lines.push(`- **Package**: \`${opts.pkgName}\``);
    if (opts.hint) lines.push(`- **Note**: ${opts.hint}`);
  } else {
    lines.push(`- **Source**: \`${opts.coverageRel}\` (regenerate via \`leaf survey\`)`);
    lines.push(`- **Package**: \`${opts.pkgName}\``);
    if (opts.summary) {
      const s = opts.summary;
      const fmt = (label: string, v?: string) => (v ? `${label} ${v}` : `${label} —`);
      lines.push(
        `- **Summary**: ${fmt("lines", s.lines)} / ${fmt("branches", s.branches)} / ${fmt("funcs", s.functions)} / ${fmt("stmts", s.statements)}`,
      );
    } else {
      lines.push("- **Summary**: _coverage txt has no parsable summary block_");
    }
    if (opts.hint) lines.push(`- **Note**: ${opts.hint}`);
  }
  lines.push("");
  return lines.join("\n");
}

interface Plan {
  notesRel: string;
  notesAbs: string;
  pkgName: string;
  coverageRel: string | null;
  summary: Summary | null;
  hint: string | null;
}

function plan(REPO: string): Plan[] {
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
  const workspaces = loadWorkspaces(REPO);
  if (workspaces.length === 0) {
    fail(`no workspaces resolved from ${relative(REPO, join(REPO, "package.json"))}`);
  }
  const out: Plan[] = [];
  for (const leaf of manifest.leaves) {
    const notesAbs = coverageDocPath(REPO, leaf);
    const notesRel = relative(REPO, notesAbs);
    const ws = workspaceForLeaf(leaf.path, workspaces);
    if (!ws) {
      out.push({
        notesRel,
        notesAbs,
        pkgName: "(no workspace)",
        coverageRel: null,
        summary: null,
        hint: `leaf path \`${leaf.path}\` does not match any workspace`,
      });
      continue;
    }
    const covAbs = coverageFileFor(REPO, ws.pkgName);
    const covRel = relative(REPO, covAbs);
    let summary: Summary | null = null;
    let hint: string | null = null;
    let coverageRel: string | null = null;
    if (existsSync(covAbs)) {
      coverageRel = covRel;
      const raw = readFileSync(covAbs, "utf-8");
      summary = parseSummary(raw);
      if (raw.includes("status: skipped") || /\bskipped\b.*— —/i.test(raw)) {
        hint = "package was skipped during coverage survey (no test runner)";
      }
    } else {
      hint = `expected \`${covRel}\` — package may not be in coverage survey output`;
    }
    out.push({ notesRel, notesAbs, pkgName: ws.pkgName, coverageRel, summary, hint });
  }
  return out;
}

async function linkCoverage(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      "Usage: leaf link coverage [--dry-run]\n\n" +
        "Refresh every leaf's LEAF.coverage[.bin-N].md from\n" +
        "coverage-survey.gitignored/<pkg>.txt. Idempotent.\n",
    );
    return;
  }
  let dryRun = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a !== "--help" && a !== "-h") fail(`unknown arg: ${a}`);
  }
  const REPO = repoRoot();
  const plans = plan(REPO);
  let updated = 0;
  let skipped = 0;
  for (const p of plans) {
    const after = buildCoverageBody({
      leafRel: p.notesRel,
      pkgName: p.pkgName,
      coverageRel: p.coverageRel,
      summary: p.summary,
      hint: p.hint,
    });
    const before = existsSync(p.notesAbs) ? readFileSync(p.notesAbs, "utf-8") : "";
    if (before === after) {
      process.stdout.write(`PASS: ${p.notesRel} (already current)\n`);
      continue;
    }
    if (dryRun) {
      process.stdout.write(`DRY:  ${p.notesRel} would update — pkg=${p.pkgName}\n`);
    } else {
      const parent = dirname(p.notesAbs);
      if (!existsSync(parent)) {
        process.stdout.write(
          `SKIP: ${p.notesRel} (parent dir missing — re-run \`leaf partition\`)\n`,
        );
        skipped++;
        continue;
      }
      writeFileSync(p.notesAbs, after, "utf-8");
      process.stdout.write(`PASS: ${p.notesRel} updated — pkg=${p.pkgName}\n`);
    }
    updated++;
  }
  process.stdout.write(
    `\nDONE: ${updated} ${dryRun ? "would update" : "updated"}, ${skipped} skipped, ${plans.length} total\n`,
  );
}

export async function link(argv: string[]): Promise<void> {
  const [domain, ...rest] = argv;
  if (!domain) throw new Error("usage: leaf link <domain> [args]");
  if (domain === "coverage") {
    await linkCoverage(rest);
    return;
  }
  throw new Error(
    `domain "${domain}" not yet built-in — register a custom DomainPlugin via \`leaf domain register ${domain}\`.`,
  );
}
