// Parse and write LEAF.<domain>.<ext> docs. Each doc has YAML frontmatter
// plus a markdown body — frontmatter is the machine contract, body is for
// humans and LLMs.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface LeafDoc<Front = Record<string, unknown>> {
  frontmatter: Front;
  body: string;
}

const DELIM = "---";

export function readLeafDoc<Front = Record<string, unknown>>(path: string): LeafDoc<Front> | null {
  if (!existsSync(path)) return null;
  return parseLeafDocText<Front>(readFileSync(path, "utf8"));
}

export function parseLeafDocText<Front = Record<string, unknown>>(text: string): LeafDoc<Front> {
  if (!text.startsWith(DELIM)) {
    return { frontmatter: {} as Front, body: text };
  }
  const end = text.indexOf(`\n${DELIM}`, DELIM.length);
  if (end === -1) {
    return { frontmatter: {} as Front, body: text };
  }
  const yamlText = text.slice(DELIM.length, end).trim();
  const body = text.slice(end + DELIM.length + 1).replace(/^\n/, "");
  return {
    frontmatter: (parseYaml(yamlText) ?? {}) as Front,
    body,
  };
}

export function writeLeafDoc(path: string, doc: LeafDoc): void {
  const yaml = stringifyYaml(doc.frontmatter).trimEnd();
  const text = `${DELIM}\n${yaml}\n${DELIM}\n\n${doc.body.replace(/\n+$/, "")}\n`;
  writeFileSync(path, text, "utf8");
}

/** Return path to LEAF.<domain>.<ext> for a leaf, given its on-disk dir + scope. */
export function leafDocPath(args: {
  leafDir: string;
  domain: string;
  scope: "subtree" | "bin";
  binId?: string;
  ext?: string;
}): string {
  // Bin-scoped leaves share a directory with their siblings, so disambiguate by
  // content-derived binId in the filename: LEAF.coverage.bin-3a7f2c.md.
  const suffix = args.scope === "bin" && args.binId ? `.bin-${args.binId}` : "";
  const ext = args.ext ?? "md";
  return `${args.leafDir}/LEAF.${args.domain}${suffix}.${ext}`;
}
