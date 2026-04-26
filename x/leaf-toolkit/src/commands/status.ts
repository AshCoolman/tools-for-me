// `leaf status <domain> --target <pct>` — query leaves below target for one
// domain. Returns JSON sorted by priority asc, gap-from-target desc.
//
// Stub: port from scripts/leaf-coverage-status.mts.

export async function status(argv: string[]): Promise<void> {
  const [domain] = argv;
  if (!domain) throw new Error("usage: leaf status <domain> [--target N] [--metric M] [--below-target] [--json]");
  throw new Error(`not yet implemented for domain "${domain}"`);
}
