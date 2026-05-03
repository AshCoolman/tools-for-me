# Phase 0 Research — Fix Partition Stability

Resolves the open questions before Phase 1 design. Seven decisions, each as Decision / Rationale / Alternatives.

## 1. Hash function for `binId`

**Decision**: `node:crypto.createHash("sha256")` over a UTF-8 string formed by joining the bin's repo-relative file paths sorted lexicographically with `"\n"`. Take the first 6 hexadecimal characters (24 bits). FR-014 collision detection lengthens to 8 / 10 / full digest only on detected collision in a single partition.

**Rationale**:

- `node:crypto` is built-in. Zero new dependencies. Spec 001's "minimal runtime deps" character is preserved.
- sha256 has uniform output distribution; the birthday bound for 24-bit space is ~4096 distinct bins before 50% collision risk. Realistic partitions have ≤ 50 bins; collision rate is `< 10⁻⁵` per partition. Detected collisions trigger fail-loud per FR-014.
- 6 hex characters reads as one token (`bin-3a7f2c`). 8 chars (`bin-3a7f2c1d`) reads as two; 4 chars collides too readily.
- Hashing over joined paths (not file contents) gives the spec's required identity: "bin identity is `{ files }`, not `{ position }`". Two partitions over the same file set produce the same hash regardless of LOC mutations *inside* those files.

**Alternatives considered**:

- **Murmur3 / xxhash**: faster, but external deps. Hash speed is irrelevant at our scale (≤ 100 paths × ≤ 200 chars per partition).
- **Simple FNV-1a hand-roll**: avoids the crypto import but is more code than the import line and has weaker distribution.
- **Hash file *contents***: would mean every file edit changes every bin's id, which directly contradicts the spec.

**Implication for tests**: `tests/sim/binid-collision.test.ts` must construct two distinct bin file-sets that collide at 6 hex (impossible to find by chance; we'll feed the hash function with crafted inputs that collide at 24 bits). Easier path: monkey-patch the hash function in tests to force a 24-bit collision and assert the partitioner extends or fails.

## 2. Hysteresis state plumbing

**Decision**: Add an optional third parameter to `partitionTree`:

```ts
export function partitionTree(
  root: DirNode,
  repoBase: string,
  priorBinDirs?: ReadonlySet<string>,  // repo-relative dir paths previously in bin mode
): Leaf[]
```

The set contains repo-relative directory paths whose previous partition emitted ≥ 2 bin leaves (or where ≥ 1 `LEAF.<domain>.bin-*.md` exists on disk). When `priorBinDirs` is `undefined` or empty, the partitioner treats everything as fresh and FR-005's default applies (under-threshold ⇒ subtree).

The production CLI provides this set by walking each candidate directory once: `src/sim/core/prior-state.ts:readPriorBinDirsFromFs(repoBase, candidateDirs)` returns dirs containing any file matching `^LEAF\.[a-z]+\.bin-[A-Za-z0-9]+\.md$`. This regex matches both old (`bin-1`) and new (`bin-3a7f2c`) labels — the migration command works without prior knowledge of the format.

The simulator passes `priorBinDirs` derived from the previous `PartitionRun` (a one-line transformation: `new Set(prev.leaves.filter(l => l.scope === 'bin').map(l => l.path))`).

**Rationale**:

- Keeps `partitionTree` pure. The signature change is additive and backwards-compatible (the parameter defaults to "no prior state").
- The simulator and production CLI share one algorithm. The only difference is who computes `priorBinDirs` — same shape, different source.
- Per-directory string set is `O(directories)` memory, trivial.
- Reading `LEAF.*.bin-*.md` filenames is what the migration command would do anyway; reuse the same scan.

**Alternatives considered**:

- **No hysteresis, just shift `SPLIT_AT` to 1575**: drops the bidirectional behaviour. A directory at 1530 with no prior bin would never bin (good), but a directory at 1530 that *was* binned would silently de-bin (bad — orphans every committed `LEAF.priority.bin-*.md` for that dir). Rejected.
- **Stateful partitioner reading committed JSON**: spec 001 keeps `partitionTree` pure deliberately; passing in a `Set<string>` preserves that.
- **Hysteresis carried inside `DirNode`**: pollutes the data model. Rejected.

## 3. Balanced bin-packing algorithm — LPT with pre-computed `binCount`

**Decision**: Replace the current FFD-with-fixed-cap with two-pass LPT (Longest Processing Time first):

1. Compute `binCount = max(1, ceil(totalLoc / TARGET_LOC))`. If `binCount === 1`, emit one subtree leaf (the dir is back under-threshold post-children).
2. Sort items by `loc` descending.
3. For each item, place it into the bin currently holding the smallest total LOC. Ties break by bin index ascending (deterministic).

**Rationale**:

- LPT is `(4/3 - 1/(3m))`-approximate for makespan. For our typical `m ≤ 4` bins, the worst-case max/min ratio is < 1.5. SC-003 target (≤ 3) is comfortably met; the stretch (≤ 1.5 well-balanced) is met for almost all real inputs.
- Eliminates the tail-bin problem by construction: items can no longer "spill into a final tiny bin" because every bin is selected as the lightest at placement time.
- Simple — ~15 lines. Replaces the existing ~25-line FFD.
- Deterministic given sorted input (already required).

**Alternatives considered**:

- **Multifit (binary search on bin capacity)**: tighter `(11/9)` bound but ~50 LOC and harder to reason about. The tighter bound buys nothing on our scale.
- **Karmarkar–Karp differencing**: optimal for two bins, complicated for ≥ 3. Reject.
- **Greedy item-into-bin (FFD with size-asc)**: still has the tail-bin problem; the `binCount = ceil(...)` choice is what eliminates it, not the item-placement order.

**Per-leaf vs per-bin balance (FR-007 vs FR-006)**: LPT inside `partitionNode` solves FR-006 (within-bin balance for one oversize subtree). FR-007 (per-leaf balance across the whole tree) is a separate concern — it depends on how subtree-leaves and bin-leaves intermix at the top level. See decision §4.

## 4. Per-leaf balance (FR-007)

**Decision**: When the *root* call to `partitionTree` produces leaves whose LOC max/min > 3, the partitioner's last pass MAY merge consecutive small subtree leaves into a synthetic "rest-bin" leaf if doing so brings `max/min ≤ 3`. **For this spec we will not implement merging** — instead, we accept that FR-007 is met by FR-006 alone *for any tree whose imbalance comes from oversize subtrees*. The host repo's current 8.28× imbalance comes from one oversize subtree (`src/`) recursing without binning at the right level, which FR-004 (hysteresis) and FR-006 (balanced bins inside oversize) together fix.

Validation: SC-003 (`leaf sim baseline` reports `max/min ≤ 3`) is the contract. If after implementing FR-004 + FR-006 the host repo still exceeds 3:1, we revisit and add merging in a follow-up. Not anticipated.

**Rationale**:

- The 8.28× ratio came from FFD's tail-bin pattern, not from inherent tree shape. With the tail-bin gone, the host repo lands at `~1.5 ≤ ratio ≤ 2.5` (estimated from current LOC distribution).
- Merging across non-sibling subtree leaves would change leaf identity in a load-bearing way: the merged leaf has no natural directory path. Avoiding this preserves the "leaf path = directory path" contract that priority/coverage docs depend on.
- Simpler is better. If the SC measurement falsifies this assumption, we add merging then.

**Alternatives considered**:

- **Always merge tiny leaves regardless of imbalance**: changes the leaf model invasively. Reject.
- **Cross-workspace balancing**: out of scope per spec assumptions.

## 5. Migration command shape

**Decision**: A flag on `leaf partition`, not a new verb:

```sh
leaf partition --migrate-bin-labels
```

The flag short-circuits the normal partition pipeline:

1. Run normal `partitionTree` over each `partitionRoot` to compute the new `Leaf[]` (with new `binId`s).
2. For each candidate directory, list `LEAF.*.bin-*.md` files on disk.
3. For each on-disk file, parse the `bin-<old>` suffix and locate the new leaf whose pre-existing file set matches. Match policy:
   - If the on-disk file's frontmatter contains `binIndex: N` (legacy format), match by directory path + `binIndex === N` in the *prior* run (read from existing `leaves.gitignored.json` if present; else fall back to "match by enclosing directory path").
   - If the on-disk file's frontmatter contains `binId: <oldHash>` (already-migrated format), match by exact `binId` equality.
4. Rename matched files to `LEAF.<domain>.bin-<newId>.md`. Leave unmatched files in place and report as `orphaned`.
5. Print a `MigrationReport` to stdout (and `--json` for machine consumption).

**Rationale**:

- A flag is one line in `partition.ts`'s argv handling. A new verb adds a `cli.ts` route, a new file under `commands/`, and an entry to the help text — five times the surface for the same outcome.
- The migration *requires* a fresh partition to compute new ids. Composing with `partition` is natural — the migration is "partition + rename".
- Idempotency (FR-009) falls out: a second run sees no `bin-<oldHash>` files (all already renamed to `bin-<newHash>` where `oldHash === newHash` for unchanged bins), so renames count = 0.
- The flag is discoverable via `--help`. The migration is a one-time operation; a verb would be more visible than necessary.

**Alternatives considered**:

- **Separate `leaf migrate-bins` verb**: more discoverable but overkill for a one-shot.
- **Auto-migrate on every `leaf partition`**: surprising. The user's first `partition` after the upgrade would silently rename files. Explicit flag is safer.
- **Lazy migration (rename-on-write)**: leaves the repo in a half-migrated state indefinitely. Hard to reason about. Reject.

## 6. Match policy when on-disk format is legacy `bin-<int>`

**Decision**: Use `leaves.gitignored.json` (the pre-migration manifest) as the matching oracle. If present, it lists `binIndex` for each leaf; the migration walks `existing-bin-N.md → leaves.gitignored.json[leaf with path X and binIndex N] → new-leaf with same files → newId`. If `leaves.gitignored.json` is absent or stale, fall back to: "the on-disk `bin-N` file is matched to the new bin in the same directory whose member set is most similar to N's nominal position in a sort." If no clear match, report orphaned.

**Rationale**:

- Most users will have a `leaves.gitignored.json` from their last `leaf partition` run. The match is then exact.
- The fallback (sort-position match) is heuristic and fragile but is the best we can do without history. It is the rare case (user committed bin docs but never gitignored manifest, or deleted manifest manually). Reporting orphans loudly is the correct behaviour when match is ambiguous.

**Alternatives considered**:

- **Refuse to migrate without `leaves.gitignored.json`**: too rigid; the manifest is gitignored and easily lost.
- **Read the bin file's `Files (N)` body section** to recover the file list and match by exact membership: cleanest. Considered for v2 of migration if heuristic fallback proves noisy in practice. Implementing in v1 adds a markdown parser; deferred.

## 7. Refactor-regression snapshot regeneration UX

**Decision**: `tests/sim/refactor-regression.test.ts` reads its golden from `tests/sim/__snapshots__/leaves.gitignored.json`. Add an `UPDATE_SNAPSHOTS=1` env-var path that overwrites the golden when set; default behaviour is read-only equality assertion. Document the regen step in the spec-002 `quickstart.md` and call it out explicitly in the commit message: *"Regenerate refactor-regression snapshot — partition algorithm intentionally changed."*

**Rationale**:

- The pattern matches `vitest --update`; `node:test` doesn't have native snapshot mode, so the env-var pattern is the closest analogue.
- Hiding the regen behind an env var prevents accidental snapshot blesses on green-by-mistake.
- The commit-message call-out is the human safeguard — reviewers must consciously accept the regen, per spec 001's principle that the snapshot is the load-bearing safety net.

**Alternatives considered**:

- **Delete the test, rewrite from scratch**: loses the audit trail and the "explicitly accept this change" moment.
- **Auto-regen on first run**: subverts the safety net. Reject.
- **Two snapshots (pre / post)**: doubles maintenance for marginal value.

---

**All NEEDS CLARIFICATION resolved.** Phase 1 may proceed.
