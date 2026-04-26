// Subcommand dispatcher for `leaf`. Keeps each verb in its own module so they
// can grow independently.

import { partition } from "./commands/partition.js";
import { priority } from "./commands/priority.js";
import { link } from "./commands/link.js";
import { status } from "./commands/status.js";
import { scopeFromPriority } from "./commands/scope-from-priority.js";
import { safeTool } from "./commands/safe-tool.js";
import { registerDomain } from "./commands/domain-register.js";

const VERBS: Record<string, (argv: string[]) => Promise<void> | void> = {
  partition,
  priority,
  link,
  status,
  "scope-from-priority": scopeFromPriority,
  "safe-tool": safeTool,
  domain: registerDomain,
};

function usage(): never {
  process.stderr.write(
    "leaf <verb> [args]\n\n" +
      "verbs:\n" +
      Object.keys(VERBS)
        .map((v) => `  ${v}`)
        .join("\n") +
      "\n",
  );
  process.exit(2);
}

async function main(): Promise<void> {
  const [verb, ...rest] = process.argv.slice(2);
  if (!verb) usage();
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
