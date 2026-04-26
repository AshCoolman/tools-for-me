// Plugin registry. Builtins listed here; user plugins are loaded by
// `leaf domain register`.

import type { DomainPlugin } from "../types.js";
import { coveragePlugin } from "./coverage.js";

export const builtinPlugins: DomainPlugin[] = [coveragePlugin as unknown as DomainPlugin];

export function findPlugin(name: string): DomainPlugin | undefined {
  return builtinPlugins.find((p) => p.name === name);
}
