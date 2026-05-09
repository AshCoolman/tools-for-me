# @ashcoolman/token-smoulder

Local quota-aware AI work dispatcher. Runs agent orchestrations on demand or
under a daemon, gated by Capacity / Contention / Value / Risk predicates.

- Quickstart: [`specs/main/quickstart.md`](specs/main/quickstart.md)
- Constitution: [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
- Plan and contracts: [`specs/main/`](specs/main/)

## UI

`token-smoulder ui` starts a local web UI at `http://127.0.0.1:8788` (loopback only, no auth). The URL is printed to stdout; there is no auto-open. Use `--port` to override. UI preferences are stored at `~/.config/token-smoulder/ui.json`.
