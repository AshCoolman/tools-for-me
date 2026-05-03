// Subcommand dispatcher for `leaf`. Keeps each verb in its own module so they
// can grow independently.

import { partition } from "./commands/partition.js";
import { priority } from "./commands/priority.js";
import { link } from "./commands/link.js";
import { status } from "./commands/status.js";
import { scopeFromPriority } from "./commands/scope-from-priority.js";
import { safeTool } from "./commands/safe-tool.js";
import { safeVitest } from "./commands/safe-vitest.js";
import { survey } from "./commands/survey.js";
import { registerDomain } from "./commands/domain-register.js";

const VERBS: Record<string, (argv: string[]) => Promise<void> | void> = {
  partition,
  priority,
  link,
  status,
  "scope-from-priority": scopeFromPriority,
  "safe-tool": safeTool,
  "safe-vitest": safeVitest,
  survey,
  domain: registerDomain,
};

function usage(): never {
  process.stderr.write(
    "leaf <verb> [args]\n\n" +
      "verbs:\n" +
      Object.keys(VERBS)
        .map((v) => `  ${v}`)
        .join("\n") +
      "\n\n" +
      "typical loop:\n" +
      "  leaf partition                       # write leaves manifest + LEAF.partition.md\n" +
      "  leaf priority [--distribute]         # interactive TUI to assign p0..p5\n" +
      "  leaf survey                          # run per-workspace coverage\n" +
      "  leaf link coverage                   # write LEAF.coverage.md per leaf\n" +
      "  leaf status coverage --target 95 --metric all --below-target --json\n" +
      "  leaf scope-from-priority             # emit JSON of files in low/lowest leaves\n" +
      "  leaf safe-tool --cap 8 -- <cmd…>     # concurrency-capped tool wrapper\n",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const [verb, ...rest] = process.argv.slice(2);
  if (!verb || verb === "-h" || verb === "--help") usage();
  const fn = VERBS[verb];
  if (!fn) {
    process.stderr.write(`unknown verb: ${verb}\n`);
    usage();
  }
  await fn(rest);
}

main().catch((err) => {
  process.stderr.write(`leaf: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
