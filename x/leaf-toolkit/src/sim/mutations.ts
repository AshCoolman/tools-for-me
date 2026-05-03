// Tree mutations for the simulator (FR-006). All mutations are pure: the input
// FixtureBuild is untouched; a new FixtureBuild is returned with the requested
// change applied and aggregates (fileLoc, subtreeLoc, allFiles) recomputed.
//
// Paths are repo-relative (e.g., "foo/bar.ts"). Internally we resolve them
// against build.repoBase to produce the absolute path stored on FileNode/DirNode.

import type { DirNode, FileNode, FixtureBuild, Mutate } from "./types.js";

function splitPath(relPath: string): { dirParts: string[]; name: string } {
  const parts = relPath.split("/").filter((s) => s.length > 0);
  if (parts.length === 0) throw new Error(`empty path`);
  const name = parts.pop()!;
  return { dirParts: parts, name };
}

function cloneTree(node: DirNode): DirNode {
  return {
    path: node.path,
    files: node.files.map((f) => ({ ...f })),
    dirs: node.dirs.map(cloneTree),
    fileLoc: node.fileLoc,
    subtreeLoc: node.subtreeLoc,
    allFiles: [],
  };
}

function recompute(node: DirNode): void {
  for (const d of node.dirs) recompute(d);
  node.fileLoc = node.files.reduce((a, f) => a + f.loc, 0);
  node.subtreeLoc = node.fileLoc + node.dirs.reduce((a, d) => a + d.subtreeLoc, 0);
  node.allFiles = [...node.files, ...node.dirs.flatMap((d) => d.allFiles)];
}

function findDir(node: DirNode, parts: string[]): DirNode | null {
  let cur: DirNode = node;
  for (const part of parts) {
    const next: DirNode | undefined = cur.dirs.find((d) => d.path.endsWith(`/${part}`));
    if (!next) return null;
    cur = next;
  }
  return cur;
}

function ensureDir(node: DirNode, parts: string[]): DirNode {
  let cur: DirNode = node;
  for (const part of parts) {
    let next: DirNode | undefined = cur.dirs.find((d) => d.path.endsWith(`/${part}`));
    if (!next) {
      next = {
        path: `${cur.path}/${part}`,
        files: [],
        dirs: [],
        fileLoc: 0,
        subtreeLoc: 0,
        allFiles: [],
      };
      cur.dirs.push(next);
      cur.dirs.sort((a, b) => a.path.localeCompare(b.path));
    }
    cur = next;
  }
  return cur;
}

function findFile(dir: DirNode, name: string): FileNode | null {
  return dir.files.find((f) => f.path.endsWith(`/${name}`)) ?? null;
}

function removeFileFrom(dir: DirNode, name: string): FileNode | null {
  const idx = dir.files.findIndex((f) => f.path.endsWith(`/${name}`));
  if (idx < 0) return null;
  const [removed] = dir.files.splice(idx, 1);
  return removed;
}

function addFileTo(dir: DirNode, name: string, loc: number): FileNode {
  const file: FileNode = { path: `${dir.path}/${name}`, loc: Math.max(0, loc) };
  dir.files.push(file);
  dir.files.sort((a, b) => a.path.localeCompare(b.path));
  return file;
}

export function applyMutation(build: FixtureBuild, m: Mutate): FixtureBuild {
  const root = cloneTree(build.root);

  switch (m.kind) {
    case "addFile": {
      const { dirParts, name } = splitPath(m.path);
      const dir = ensureDir(root, dirParts);
      addFileTo(dir, name, m.loc);
      break;
    }
    case "removeFile": {
      const { dirParts, name } = splitPath(m.path);
      const dir = findDir(root, dirParts);
      if (!dir) throw new Error(`removeFile: parent dir missing for ${m.path}`);
      const removed = removeFileFrom(dir, name);
      if (!removed) throw new Error(`removeFile: file not found ${m.path}`);
      break;
    }
    case "growFile": {
      const { dirParts, name } = splitPath(m.path);
      const dir = findDir(root, dirParts);
      if (!dir) throw new Error(`growFile: parent dir missing for ${m.path}`);
      const file = findFile(dir, name);
      if (!file) throw new Error(`growFile: file not found ${m.path}`);
      file.loc = Math.max(0, file.loc + m.deltaLoc);
      break;
    }
    case "shrinkFile": {
      const { dirParts, name } = splitPath(m.path);
      const dir = findDir(root, dirParts);
      if (!dir) throw new Error(`shrinkFile: parent dir missing for ${m.path}`);
      const file = findFile(dir, name);
      if (!file) throw new Error(`shrinkFile: file not found ${m.path}`);
      file.loc = Math.max(0, file.loc - m.deltaLoc);
      break;
    }
    case "renameFile": {
      const fromSplit = splitPath(m.fromPath);
      const toSplit = splitPath(m.toPath);
      const fromDir = findDir(root, fromSplit.dirParts);
      if (!fromDir) throw new Error(`renameFile: source dir missing for ${m.fromPath}`);
      const removed = removeFileFrom(fromDir, fromSplit.name);
      if (!removed) throw new Error(`renameFile: source file not found ${m.fromPath}`);
      const toDir = ensureDir(root, toSplit.dirParts);
      addFileTo(toDir, toSplit.name, removed.loc);
      break;
    }
    case "moveFile": {
      const { dirParts, name } = splitPath(m.path);
      const fromDir = findDir(root, dirParts);
      if (!fromDir) throw new Error(`moveFile: source dir missing for ${m.path}`);
      const removed = removeFileFrom(fromDir, name);
      if (!removed) throw new Error(`moveFile: source file not found ${m.path}`);
      const toDirParts = m.toDir.split("/").filter((s) => s.length > 0);
      const toDir = ensureDir(root, toDirParts);
      addFileTo(toDir, name, removed.loc);
      break;
    }
    case "addDir": {
      const parts = m.path.split("/").filter((s) => s.length > 0);
      ensureDir(root, parts);
      break;
    }
    case "removeDir": {
      const parts = m.path.split("/").filter((s) => s.length > 0);
      if (parts.length === 0) throw new Error(`removeDir: cannot remove root`);
      const parentParts = parts.slice(0, -1);
      const targetName = parts[parts.length - 1];
      const parent = findDir(root, parentParts);
      if (!parent) throw new Error(`removeDir: parent dir missing for ${m.path}`);
      const idx = parent.dirs.findIndex((d) => d.path.endsWith(`/${targetName}`));
      if (idx < 0) throw new Error(`removeDir: dir not found ${m.path}`);
      parent.dirs.splice(idx, 1);
      break;
    }
  }

  recompute(root);
  return { spec: build.spec, repoBase: build.repoBase, root };
}
