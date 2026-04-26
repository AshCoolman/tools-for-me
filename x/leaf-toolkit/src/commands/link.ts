// `leaf link <domain>` — refresh LEAF.<domain>.md for every leaf, by calling
// the domain plugin's fetchStatus + renderDoc. Idempotent.
//
// Stub: wires to plugin registry + parser. Port logic from
// scripts/leaf-link-coverage.mts.

export async function link(argv: string[]): Promise<void> {
  const [domain] = argv;
  if (!domain) throw new Error("usage: leaf link <domain>");
  throw new Error(`not yet implemented for domain "${domain}"`);
}
