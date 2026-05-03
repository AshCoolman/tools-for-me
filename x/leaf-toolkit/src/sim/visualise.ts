// ASCII tree visualisation of a partitioned source tree (FR-010).
// Output is markdown-fenced-code-block-safe: only ASCII + the standard
// box-drawing chars (├──, └──, │) and a 2-space indent per level.

import { leafIdentity } from "./overlap.js";
import type { DirNode, Leaf } from "./types.js";

interface FileLeafIndex {
  fileToLeafLabel: Map<string, string>;
  leafLabelToId: Map<string, number>;
  legend: Array<{ id: number; label: string; path: string; binId?: string }>;
}

function buildIndex(leaves: Leaf[]): FileLeafIndex {
  const fileToLeafLabel = new Map<string, string>();
  const leafLabelToId = new Map<string, number>();
  const legend: Array<{ id: number; label: string; path: string; binId?: string }> = [];
  let nextId = 1;
  for (const leaf of leaves) {
    const label = leafIdentity(leaf);
    if (!leafLabelToId.has(label)) {
      const id = nextId++;
      leafLabelToId.set(label, id);
      legend.push({ id, label, path: leaf.path, binId: leaf.binId });
    }
    for (const file of leaf.files) {
      fileToLeafLabel.set(file, label);
    }
  }
  return { fileToLeafLabel, leafLabelToId, legend };
}

function annotation(leafLabel: string | undefined, leafLabelToId: Map<string, number>): string {
  if (!leafLabel) return "";
  const id = leafLabelToId.get(leafLabel);
  return id !== undefined ? `  [L${id}]` : "";
}

function renderNode(
  node: DirNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
  repoBase: string,
  index: FileLeafIndex,
  out: string[],
): void {
  const name = isRoot ? node.path.replace(`${repoBase}/`, "") || "/" : node.path.split("/").pop()!;
  if (isRoot) {
    out.push(`${name}`);
  } else {
    const branch = isLast ? "└── " : "├── ";
    out.push(`${prefix}${branch}${name}`);
  }
  const childPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
  const entries: Array<{ kind: "dir"; node: DirNode } | { kind: "file"; path: string; loc: number }> = [
    ...node.dirs.map((d) => ({ kind: "dir" as const, node: d })),
    ...node.files.map((f) => ({ kind: "file" as const, path: f.path, loc: f.loc })),
  ];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const last = i === entries.length - 1;
    if (e.kind === "dir") {
      renderNode(e.node, childPrefix, last, false, repoBase, index, out);
    } else {
      const fileBase = e.path.split("/").pop()!;
      // Convert file path to repo-relative for index lookup.
      const repoRelativeFile = e.path.replace(`${repoBase}/`, "");
      const leafLabel = index.fileToLeafLabel.get(repoRelativeFile);
      const ann = annotation(leafLabel, index.leafLabelToId);
      const branch = last ? "└── " : "├── ";
      out.push(`${childPrefix}${branch}${fileBase}${ann}`);
    }
  }
}

export function renderAscii(root: DirNode, leaves: Leaf[], opts?: { showExcluded?: boolean }): string {
  // opts.showExcluded reserved for future use; pure DirNodes never include excluded dirs.
  void opts;
  const index = buildIndex(leaves);
  const repoBase = root.path.includes("/") ? root.path.slice(0, root.path.lastIndexOf("/")) : "";
  const lines: string[] = [];
  renderNode(root, "", true, true, repoBase, index, lines);

  lines.push("");
  lines.push("Legend:");
  for (const entry of index.legend) {
    lines.push(`  L${entry.id} → ${entry.label}`);
  }
  return lines.join("\n");
}
