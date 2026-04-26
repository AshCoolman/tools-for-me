// `leaf domain register <name>` — scaffold a new work-type plugin under
// src/plugins/<name>/ implementing DomainPlugin. Useful for adding refactor,
// security, doc-debt, or any other custom flow.
//
// Stub: writes a plugin skeleton + registers it in plugins/index.ts.

export async function registerDomain(argv: string[]): Promise<void> {
  const [verb, name] = argv;
  if (verb !== "register" || !name) {
    throw new Error("usage: leaf domain register <name>");
  }
  throw new Error("not yet implemented — generates src/plugins/<name>/ stub");
}
