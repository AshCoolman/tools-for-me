// `leaf priority` — interactive TUI to assign p0..p5 per leaf. Reads
// leaves.gitignored.json + each leaf's LEAF.priority[.bin-N].md (current),
// optionally LEAF.audit[.bin-N].md (preview). Writes the chosen level back to
// LEAF.priority.md frontmatter and preserves any existing body.
//
// `--distribute` mode: prints histogram of current vs suggested target
// distribution, walks the user through reclassifying outliers.

import { checkbox, select } from "@inquirer/prompts";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "../repo-root.js";

// Suggested target distribution. Thin at p0/p1, fat tail at p4, tapering p5.
// Edit per project risk shape.
const LEVELS = [
  { value: "critical", short: "p0", label: "p0 — critical", pct: 0.05 },
  { value: "high",     short: "p1", label: "p1 — high",     pct: 0.08 },
  { value: "medium",   short: "p2", label: "p2 — medium",   pct: 0.17 },
  { value: "normal",   short: "p3", label: "p3 — normal",   pct: 0.25 },
  { value: "low",      short: "p4", label: "p4 — low",      pct: 0.30 },
  { value: "lowest",   short: "p5", label: "p5 — lowest",   pct: 0.15 },
] as const;

type Level = (typeof LEVELS)[number]["value"];
const LEVEL_VALUES = LEVELS.map((l) => l.value) as readonly Level[];

interface ManifestLeaf {
  path: string;
  scope: "subtree" | "bin";
  binIndex?: number;
  binTotal?: number;
  files: string[];
  loc: number;
}

interface Leaf extends ManifestLeaf {
  notesAbs: string;
  notesRel: string;
  current: Level | null;
}

function fail(msg: string): never {
  process.stderr.write(`FAIL: ${msg}\n`);
  process.exit(1);
}

function usage(): void {
  process.stdout.write(
    [
      "Usage: leaf priority [--distribute]",
      "",
      "Interactive TUI: assign priority (p0–p5) to each leaf.",
      "",
      "Default mode:",
      "  Reads leaves.gitignored.json. Already-prioritised leaves are",
      "  selectable but default unchecked. Writes `priority: <value>`",
      "  to LEAF.priority[.bin-N].md frontmatter (preserves body).",
      "",
      "--distribute:",
      "  Prints a histogram (current vs suggested target distribution),",
      "  prompts for a priority level to inspect, lists leaves at that level,",
      "  and lets you reclassify them one by one.",
      "",
      "Requires a TTY. No side effects without explicit selection.",
      "",
    ].join("\n"),
  );
}

function priorityDocPath(REPO: string, leaf: ManifestLeaf): string {
  const suffix =
    leaf.binIndex !== undefined && leaf.binIndex !== null ? `.bin-${leaf.binIndex}` : "";
  return join(REPO, leaf.path, `LEAF.priority${suffix}.md`);
}

function auditDocPath(REPO: string, leaf: ManifestLeaf): string {
  const suffix =
    leaf.binIndex !== undefined && leaf.binIndex !== null ? `.bin-${leaf.binIndex}` : "";
  return join(REPO, leaf.path, `LEAF.audit${suffix}.md`);
}

function readPriority(absPath: string): Level | null {
  let txt: string;
  try {
    txt = readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
  const m = txt.match(/^priority:\s*([A-Za-z]+)\s*$/m);
  if (!m) return null;
  const v = m[1].toLowerCase();
  if (v === "unset") return null;
  return (LEVEL_VALUES as readonly string[]).includes(v) ? (v as Level) : null;
}

function loadLeaves(REPO: string): Leaf[] {
  const MANIFEST = join(REPO, "leaves.gitignored.json");
  let raw: { leaves?: ManifestLeaf[] };
  try {
    raw = JSON.parse(readFileSync(MANIFEST, "utf-8"));
  } catch (err: any) {
    fail(
      `cannot read ${relative(REPO, MANIFEST)}: ${err?.message ?? err} — run \`leaf partition\` first`,
    );
  }
  if (!raw.leaves || raw.leaves.length === 0) {
    fail(`no leaves in ${relative(REPO, MANIFEST)} — run \`leaf partition\` first`);
  }
  return raw.leaves.map((l) => {
    const abs = priorityDocPath(REPO, l);
    return {
      ...l,
      notesAbs: abs,
      notesRel: relative(REPO, abs),
      current: readPriority(abs),
    };
  });
}

function shortFor(p: Level | null): string {
  if (!p) return "—";
  return LEVELS.find((l) => l.value === p)!.short;
}

function leafLabel(l: Leaf): string {
  const tag = `[${shortFor(l.current).padEnd(2)}]`;
  const bin = l.binIndex ? ` bin ${l.binIndex}/${l.binTotal}` : "";
  const meta = `${l.loc.toString().padStart(5)} LOC  ${l.files.length.toString().padStart(2)}f`;
  return `${tag}  ${meta}  ${l.path}${bin}`;
}

function leafCheckedLabel(l: Leaf): string {
  const base = leafLabel(l);
  if (l.current) return `${base}  ⚠ overwrite (current: ${shortFor(l.current)})`;
  return base;
}

async function selectLeaves(leaves: Leaf[]): Promise<Leaf[]> {
  const choices = leaves.map((l) => ({
    name: leafLabel(l),
    checkedName: leafCheckedLabel(l),
    value: l.notesAbs,
    checked: false,
  }));
  const picked = await checkbox<string>({
    message:
      "Select leaves to (re)prioritise — space toggle, a all, i invert, enter confirm",
    choices: choices as never,
    pageSize: 28,
    loop: false,
  });
  return leaves.filter((l) => picked.includes(l.notesAbs));
}

function previewLeaf(REPO: string, l: Leaf): void {
  const out: string[] = [];
  out.push(`Leaf: ${l.path}${l.binIndex ? ` (bin ${l.binIndex}/${l.binTotal})` : ""}`);
  out.push(`Files: ${l.files.length}, LOC: ${l.loc}`);
  const auditAbs = auditDocPath(REPO, l);
  let auditTxt = "";
  try {
    auditTxt = readFileSync(auditAbs, "utf-8");
  } catch {
    /* no audit yet */
  }
  if (auditTxt) {
    const lines = auditTxt.split("\n");
    const riskIdx = lines.findIndex((ln) => /^## Primary risky logic/i.test(ln));
    if (riskIdx >= 0) {
      out.push("");
      const next = lines.slice(riskIdx + 1).findIndex((ln) => /^## /.test(ln));
      const end = next >= 0 ? riskIdx + 1 + next : Math.min(lines.length, riskIdx + 16);
      out.push(...lines.slice(riskIdx, end));
    }
  }
  process.stdout.write("\n" + out.join("\n").trim() + "\n\n");
}

async function pickPriority(REPO: string, l: Leaf): Promise<Level | null> {
  previewLeaf(REPO, l);
  const choices: Array<{ name: string; value: Level | "skip" }> = [
    {
      name: l.current ? `keep current (${l.current})` : "skip — no priority",
      value: "skip",
    },
    ...LEVELS.map((lv) => ({ name: lv.label, value: lv.value as Level })),
  ];
  const ans = await select<Level | "skip">({
    message: `Priority for ${l.path}${l.binIndex ? ` bin ${l.binIndex}/${l.binTotal}` : ""}`,
    choices,
    loop: false,
    default: l.current ?? "skip",
  });
  return ans === "skip" ? null : ans;
}

function countByLevel(leaves: Leaf[]): Map<Level | "unset", number> {
  const m = new Map<Level | "unset", number>();
  for (const lv of LEVELS) m.set(lv.value, 0);
  m.set("unset", 0);
  for (const l of leaves) {
    const k: Level | "unset" = l.current ?? "unset";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function targetFor(total: number, pct: number): number {
  return Math.round(total * pct);
}

function ansi(s: string, code: number): string {
  return process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;
}

function printHistogram(leaves: Leaf[]): void {
  const total = leaves.length;
  const counts = countByLevel(leaves);
  const targets = LEVELS.map((lv) => ({
    value: lv.value,
    n: targetFor(total, lv.pct),
  }));
  const maxN = Math.max(
    ...LEVELS.map((lv) =>
      Math.max(counts.get(lv.value) ?? 0, targets.find((t) => t.value === lv.value)!.n),
    ),
    counts.get("unset") ?? 0,
  );
  const W = 30;
  const scale = maxN > 0 ? W / maxN : 1;
  const bar = (n: number, ch: string) => ch.repeat(Math.round(n * scale));

  process.stdout.write(`\nDistribution of ${total} leaves\n`);
  process.stdout.write(
    `${"label".padEnd(14)}  ${"current".padEnd(W + 5)}  ${"target".padEnd(W + 5)}  delta\n`,
  );
  process.stdout.write(`${"-".repeat(14 + 2 + W + 5 + 2 + W + 5 + 2 + 5)}\n`);
  for (const lv of LEVELS) {
    const cur = counts.get(lv.value) ?? 0;
    const tgt = targets.find((t) => t.value === lv.value)!.n;
    const delta = cur - tgt;
    const deltaStr =
      delta === 0
        ? ansi("  on target", 32)
        : delta > 0
          ? ansi(`+${delta} over`, 33)
          : ansi(`${delta} under`, 36);
    const curBar = bar(cur, "█");
    const tgtBar = bar(tgt, "░");
    process.stdout.write(
      `${lv.label.padEnd(14)}  ${(curBar + " " + cur).padEnd(W + 5)}  ${(tgtBar + " " + tgt).padEnd(W + 5)}  ${deltaStr}\n`,
    );
  }
  const u = counts.get("unset") ?? 0;
  if (u > 0) {
    process.stdout.write(
      `${"unset".padEnd(14)}  ${(bar(u, "·") + " " + u).padEnd(W + 5)}  ${"".padEnd(W + 5)}  ${ansi("(needs assignment)", 33)}\n`,
    );
  }
  process.stdout.write("\n");
}

async function distributeMode(REPO: string, leaves: Leaf[]): Promise<void> {
  printHistogram(leaves);

  const counts = countByLevel(leaves);
  const total = leaves.length;
  const choices: Array<{
    name: string;
    value: Level | "unset" | "exit";
    disabled?: string | false;
  }> = LEVELS.map((lv) => {
    const cur = counts.get(lv.value) ?? 0;
    const tgt = targetFor(total, lv.pct);
    const delta = cur - tgt;
    const tag = delta === 0 ? "on" : delta > 0 ? `+${delta}` : `${delta}`;
    return {
      name: `${lv.label.padEnd(14)}  current=${String(cur).padStart(2)}  target=${String(tgt).padStart(2)}  (${tag})`,
      value: lv.value,
      disabled: cur === 0 ? "no leaves at this level" : false,
    };
  });
  const unsetCount = counts.get("unset") ?? 0;
  if (unsetCount > 0) {
    choices.push({
      name: `${"unset".padEnd(14)}  current=${String(unsetCount).padStart(2)}  (assign new priority)`,
      value: "unset",
    });
  }
  choices.push({ name: "exit (write nothing)", value: "exit" });

  const picked = await select<Level | "unset" | "exit">({
    message: "Inspect which level for reclassification?",
    choices: choices as never,
    loop: false,
  });
  if (picked === "exit") {
    process.stdout.write("Exited.\n");
    return;
  }

  const bucket = leaves.filter((l) =>
    picked === "unset" ? l.current === null : l.current === picked,
  );
  if (bucket.length === 0) {
    process.stdout.write("No leaves at that level.\n");
    return;
  }

  const subChoices = bucket.map((l) => ({
    name: leafLabel(l),
    checkedName: leafCheckedLabel(l),
    value: l.notesAbs,
    checked: false,
  }));
  const pickedAbs = await checkbox<string>({
    message: `Select leaves at ${picked} to reclassify  (space toggle, a all, i invert, enter confirm)`,
    choices: subChoices as never,
    pageSize: 28,
    loop: false,
  });
  const targets = bucket.filter((l) => pickedAbs.includes(l.notesAbs));
  if (targets.length === 0) {
    process.stdout.write("Nothing selected.\n");
    return;
  }

  const assignments: Array<{ leaf: Leaf; level: Level }> = [];
  for (const leaf of targets) {
    const level = await pickPriority(REPO, leaf);
    if (level === null) continue;
    assignments.push({ leaf, level });
  }
  if (assignments.length === 0) {
    process.stdout.write("\nNo priorities to write.\n");
    return;
  }
  for (const { leaf, level } of assignments) {
    writePriority(REPO, leaf.notesAbs, level);
    process.stdout.write(`PASS: ${leaf.notesRel} → ${level}\n`);
  }
  process.stdout.write(`\nReclassified ${assignments.length}.\n\n`);

  const after = leaves.map((l) => ({ ...l, current: readPriority(l.notesAbs) }));
  printHistogram(after);
}

function writePriority(REPO: string, absPath: string, level: Level): void {
  let existingBody = "";
  try {
    const txt = readFileSync(absPath, "utf-8");
    const fmMatch = txt.match(/^---\n[\s\S]*?\n---\n/);
    if (fmMatch) existingBody = txt.slice(fmMatch[0].length).replace(/^\n+/, "");
  } catch {
    /* file may not exist yet */
  }
  const leafPath = relative(REPO, absPath).replace(/\/LEAF\.priority(\.bin-\d+)?\.md$/, "");
  const out =
    `---\ndomain: priority\nleafPath: ${leafPath}\npriority: ${level}\n---\n\n` +
    (existingBody ||
      `# Priority — \`${leafPath}\`\n\nSet to **${level}**.\n\nReason: _populate as the priority decision is made durable._\n`);
  writeFileSync(absPath, out, "utf-8");
}

export async function priority(argv: string[]): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    usage();
    return;
  }
  const distribute = argv.includes("--distribute");
  const unknown = argv.find((a) => a !== "--distribute");
  if (unknown) fail(`unknown arg: ${unknown} — see --help`);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("requires a TTY (interactive prompts) — refusing in non-TTY");
  }

  const REPO = repoRoot();
  const leaves = loadLeaves(REPO);

  if (distribute) {
    await distributeMode(REPO, leaves);
    return;
  }

  const totals = LEVELS.map((lv) => ({
    short: lv.short,
    n: leaves.filter((l) => l.current === lv.value).length,
  }));
  const unset = leaves.filter((l) => !l.current).length;
  process.stdout.write(
    `Leaves: ${leaves.length}  ` +
      totals.map((t) => `${t.short}=${t.n}`).join("  ") +
      `  unset=${unset}\n`,
  );

  const picked = await selectLeaves(leaves);
  if (picked.length === 0) {
    process.stdout.write("Nothing selected.\n");
    return;
  }
  const assignments: Array<{ leaf: Leaf; level: Level }> = [];
  for (const leaf of picked) {
    const level = await pickPriority(REPO, leaf);
    if (level === null) continue;
    assignments.push({ leaf, level });
  }
  if (assignments.length === 0) {
    process.stdout.write("\nNo priorities to write.\n");
    return;
  }
  for (const { leaf, level } of assignments) {
    writePriority(REPO, leaf.notesAbs, level);
    process.stdout.write(`PASS: ${leaf.notesRel} → ${level}\n`);
  }
  process.stdout.write(
    `\nWrote ${assignments.length} priorit${assignments.length === 1 ? "y" : "ies"}.\n`,
  );
}
