# Leaf Allocation Simulator — BDD Scenarios

100 Gherkin-style scenarios that the harness specified in [spec.md](spec.md) is intended to make answerable. These are not all required to pass on day one — they describe the *question shape* the simulator must support.

Grouped for navigability:

- [Overlap & safety](#overlap--safety) (1–12)
- [Drift across re-runs](#drift-across-re-runs) (13–25)
- [Agent allocation & collision](#agent-allocation--collision) (26–40)
- [Visualisation](#visualisation) (41–50)
- [Balance metrics](#balance-metrics) (51–60)
- [Boundary conditions](#boundary-conditions) (61–72)
- [Mutation primitives](#mutation-primitives) (73–82)
- [Determinism](#determinism) (83–88)
- [Refactor regression](#refactor-regression) (89–94)
- [Pathological / adversarial](#pathological--adversarial) (95–100)

---

## Overlap & safety

### Scenario 1: clean partition has no shared files
  Given a flat synthetic tree of 30 small files under one directory, total LOC under SPLIT_AT
  When the partition core runs
  Then no file path appears in more than one leaf's `files[]`
  And the safety report prints `overlap: 0`

### Scenario 2: bin-packed siblings remain disjoint
  Given a tree forced into 4 bins under one parent (siblings totalling > SPLIT_AT)
  When partitioned
  Then every pair of bins has an empty file-set intersection

### Scenario 3: parent bin and child subtree do not overlap
  Given a tree combining a bin-packed parent with a recursed oversize child subtree
  When partitioned
  Then no file appears in both a parent bin and a child subtree leaf

### Scenario 4: harness fails loudly on a mocked broken partition
  Given a stub partition function that returns two leaves both claiming the same file
  When the harness validates safety
  Then it raises a named violation listing the shared file and both offending leaves

### Scenario 5: a single-leaf partition cannot collide
  Given a tree of one file under TARGET_LOC
  When partitioned
  Then exactly one leaf is produced and overlap is zero by construction

### Scenario 6: zero-overlap is reported affirmatively
  Given a partition with no overlap
  When the safety report renders
  Then it prints `overlap: 0` rather than empty output

### Scenario 7: duplicate-within-one-leaf is a separate violation class
  Given a corrupted leaf containing the same file path twice in its `files[]`
  When the harness validates
  Then the duplicate is flagged as `intra-leaf-duplicate`, distinct from `cross-leaf-overlap`

### Scenario 8: excluded files never appear in any leaf
  Given a tree whose source dir contains `Foo.test.ts`, `Foo.d.ts`, and `Foo.ts`
  When partitioned
  Then only `Foo.ts` appears in any leaf and the harness asserts the absence of the other two

### Scenario 9: paths matching but bin indices differing are not a file collision
  Given two leaves at `src/foo` with `bin-1` and `bin-2`
  When overlap is computed
  Then identical leaf paths are not counted as collisions; only shared file paths are

### Scenario 10: overlap report is stable across repeated runs
  Given the same fixture partitioned three times
  When overlap is computed each run
  Then all three reports are byte-identical and zero

### Scenario 11: the harness covers `direct files` bin items
  Given a directory containing both subdirectories and direct files where the direct files form their own bin item
  When partitioned
  Then the direct-files bin's content is unique and disjoint from sibling bins

### Scenario 12: overlap check scales to 200+ leaves
  Given a synthetic tree producing 200 leaves
  When overlap is computed
  Then the result completes in under 5 seconds and reports zero

---

## Drift across re-runs

### Scenario 13: 20 LOC near the threshold can renumber bins
  Given fixture T with one directory at 1490 LOC across 5 files
  When 20 LOC are added to a single file taking the parent past SPLIT_AT
  Then the drift report names the bin renumbering and lists which files moved into which bin

### Scenario 14: adding one small file in a low-pressure leaf is a single-line drift
  Given fixture T with a leaf well under SPLIT_AT
  When one new 50-LOC file is added in that leaf
  Then drift report shows exactly one file added and zero bin renumbering

### Scenario 15: identical inputs produce empty drift
  Given fixture T partitioned twice with no mutation
  When drift is computed
  Then drift report is empty

### Scenario 16: shrinking a file may release a bin split
  Given fixture T with a 3-bin parent
  When the largest file in the parent shrinks enough that 2 bins now suffice
  Then drift report shows bin count decreased and renumbering occurred

### Scenario 17: first-fit-decreasing reorders on a 5-LOC change
  Given fixture T with a parent split into 3 bins where two siblings have nearly identical LOC
  When the larger of the two grows by 5 LOC
  Then the drift report shows whether the sort key flip caused the two to land in different bins than before

### Scenario 18: rename within a directory is a path-only drift
  Given fixture T with file `a.ts` in dir D
  When `a.ts` is renamed to `b.ts` in the same dir
  Then drift report flags it as a rename, not as separate add/remove entries

### Scenario 19: cross-directory move surfaces both leaves
  Given fixture T with file `x.ts` in dir A
  When `x.ts` is moved to dir B and both A and B remain valid leaves
  Then drift report names origin leaf A and destination leaf B for that file

### Scenario 20: crossing SPLIT_AT triggers a documented split
  Given fixture T with a leaf at subtreeLoc 1499
  When 2 LOC are added bringing the leaf to 1501
  Then drift report shows the leaf split into bins and lists the bin assignments

### Scenario 21: drift is itself deterministic
  Given fixture T mutated by a fixed sequence of operations
  When drift is computed twice from the same pair of partition runs
  Then both drift reports are byte-identical

### Scenario 22: bin-N file-set replacement is a renumbering, not an unrelated leaf
  Given `src/foo bin-2` containing `[a, b, c]` in run T
  When mutation produces `src/foo bin-2` containing `[b, c, d]` in run T'
  Then drift report classifies this as bin renumbering at the same path, not as separate leaves added/removed

### Scenario 23: deleting a file decreases the owning leaf's LOC
  Given fixture T with a 100-LOC file in a leaf
  When the file is deleted
  Then drift report shows one file removed and the leaf's LOC decreased by 100

### Scenario 24: idempotent mutation produces empty drift
  Given fixture T
  When `growFile(p, 0)` is applied as a no-op
  Then drift report is empty

### Scenario 25: drift over the leaf-toolkit's own src/ when one real file grows
  Given a snapshot of `src/` with current LOC counts
  When one real source file is grown by 100 LOC in the snapshot
  Then drift report names exactly the leaves affected by the change

---

## Agent allocation & collision

### Scenario 26: round-robin without wrap is collision-free
  Given 10 leaves and 5 agents under round-robin (one leaf per agent)
  When allocation runs
  Then collision matrix is empty

### Scenario 27: round-robin with wrap surfaces collisions
  Given 5 leaves and 10 agents under round-robin
  When allocation runs
  Then each leaf is assigned to exactly 2 agents and the matrix lists every paired agent's shared files

### Scenario 28: random-uniform without replacement is collision-free
  Given 10 leaves and 5 agents under random-uniform-without-replacement
  When allocation runs
  Then collision matrix is empty

### Scenario 29: random-uniform with replacement surfaces shared file sets
  Given 10 leaves and 5 agents under random-uniform-with-replacement
  When two agents land on the same leaf
  Then collision matrix lists the full file set for that leaf as shared by those two agents

### Scenario 30: priority-weighted respects supplied weights
  Given 10 leaves with explicit priority weights and 5 agents under priority-weighted allocation
  When run with sufficient samples
  Then per-leaf selection rates match the weight distribution within a documented tolerance

### Scenario 31: seeded allocation is reproducible
  Given an allocation strategy with seed S
  When run twice
  Then assignments are identical

### Scenario 32: different seeds produce different non-deterministic runs
  Given two seeds S1 ≠ S2
  When random-uniform allocation runs with each
  Then the assignments differ

### Scenario 33: replayed assignment over drifted partition surfaces file-set delta
  Given an agent recorded as picking leaf `src/foo bin-2` at time T
  When partition has drifted by time T' and bin-2 now contains a different file set
  Then the simulator reports the file-set difference between the recorded and current assignment

### Scenario 34: empirical collisions outrank strategy claims
  Given an allocation strategy that claims no-replacement
  When the strategy returns a duplicate leaf assignment
  Then the harness flags the empirical collision rather than trusting the strategy's contract

### Scenario 35: zero-weight leaves are never selected
  Given a leaf with priority weight 0
  When priority-weighted allocation runs
  Then that leaf is never assigned to any agent

### Scenario 36: K > leaves makes collisions inevitable
  Given more agents than leaves under round-robin
  When allocation runs
  Then the collision report quantifies exactly how many agents share each leaf

### Scenario 37: K = 1 has empty collision matrix
  Given exactly 1 agent under any strategy
  When allocation runs
  Then the collision matrix is empty

### Scenario 38: K = 0 returns empty assignments cleanly
  Given 0 agents
  When allocation runs
  Then the result is an empty assignment map and no errors are raised

### Scenario 39: single-leaf partition with K=2 collides on every file
  Given a partition with one leaf containing 12 files
  When 2 agents allocate under round-robin
  Then collision matrix lists all 12 files as shared by the two agents

### Scenario 40: equal weights converge on uniform selection
  Given priority-weighted allocation with all weights equal
  When run with sufficient samples
  Then per-leaf selection rates converge on uniform within the documented tolerance

---

## Visualisation

### Scenario 41: ASCII tree annotates files with leaf id
  Given a partition of 6 leaves with no bins
  When the visualiser renders the tree
  Then each file is annotated with its leaf id and a legend maps id → leaf path

### Scenario 42: bin index appears in the annotation
  Given a partition that includes a bin'd parent
  When rendered
  Then files inside that parent show annotations like `[L3.bin-2]`

### Scenario 43: side-by-side diff highlights changed assignments
  Given two partitions before and after a mutation
  When rendered side-by-side
  Then files whose leaf changed are highlighted in both columns

### Scenario 44: indentation reflects directory depth
  Given a deep tree of depth 8
  When rendered
  Then indentation increases by a fixed amount per level and remains consistent

### Scenario 45: output is markdown-fenced-code-block safe
  Given any partition rendered via the visualiser
  When the result is pasted inside a triple-backtick code block in markdown
  Then no characters break the rendering

### Scenario 46: empty tree renders explicitly
  Given a partition with zero leaves
  When rendered
  Then the visualiser prints `(empty)` rather than empty output or a thrown error

### Scenario 47: large partitions render readably
  Given a partition with 200 leaves
  When rendered
  Then the legend is paginated or truncated cleanly and no line exceeds 200 chars

### Scenario 48: excluded files appear faded or absent
  Given a tree where excluded files coexist with source files
  When rendered with the `--show-excluded` flag
  Then excluded files appear visually distinct (faded marker) and unannotated

### Scenario 49: visualiser is deterministic
  Given a partition rendered twice from the same input
  When the outputs are compared
  Then they are byte-identical

### Scenario 50: bin members list appears beside the directory
  Given a multi-bin parent
  When the parent line is rendered
  Then the `members` list (per the partition manifest) appears as a comment beside the directory line

---

## Balance metrics

### Scenario 51: standard balance metrics emitted
  Given a partition of 20 leaves
  When balance metrics are computed
  Then mean LOC, stddev, min, max, max/min ratio, mean files, stddev files are all emitted

### Scenario 52: 3× outlier surfaces in max/min ratio
  Given a partition where one leaf is 3× the median LOC
  When metrics are computed
  Then the max/min ratio is at least 3 and the report names the offending leaf

### Scenario 53: single leaf is trivially balanced
  Given a partition with exactly 1 leaf
  When metrics are computed
  Then stddev is 0, max/min ratio is 1, and no division-by-zero errors are raised

### Scenario 54: empty partition is named, not crashed
  Given a partition with 0 leaves
  When metrics are computed
  Then the report names the empty case (`leafCount: 0`) and emits no ratios

### Scenario 55: tight LOC distribution shows small stddev
  Given a partition where all leaves are within ±5 LOC of each other
  When metrics are computed
  Then stddev is small relative to mean and max/min approaches 1

### Scenario 56: comparison view across runs
  Given two partition runs with their balance metrics
  When the comparison view renders
  Then it shows whether mean, stddev, and max/min ratio improved or degraded

### Scenario 57: file-count balance is reported separately from LOC balance
  Given a partition where leaves are LOC-balanced but file-count-skewed
  When metrics are computed
  Then both balance views are reported separately and the divergence is visible

### Scenario 58: bin LOC values respect the SPLIT_AT cap
  Given a partition with one oversize subtree split into bins
  When bin LOC values are inspected
  Then every bin's loc is ≤ SPLIT_AT (1500)

### Scenario 59: balance verdicts are backed by named thresholds
  Given a balance report claiming "well-balanced"
  When the claim is checked
  Then it cites a documented threshold (e.g. max/min ≤ 1.5)

### Scenario 60: same generator parameters give similar balance
  Given two seeded random fixtures with the same shape parameters
  When metrics are computed for each
  Then values fall within a documented variance band

---

## Boundary conditions

### Scenario 61: subtreeLoc = SPLIT_AT exactly
  Given a directory whose subtreeLoc is exactly 1500
  When partitioned
  Then the harness records whether it splits or stays as one leaf and the answer matches the production code's `<= SPLIT_AT` check

### Scenario 62: subtreeLoc = SPLIT_AT − 1
  Given a directory at subtreeLoc 1499
  When partitioned
  Then it forms a single subtree leaf with no bins

### Scenario 63: subtreeLoc = SPLIT_AT + 1
  Given a directory at subtreeLoc 1501
  When partitioned
  Then it splits into bins and the harness asserts at least 2 bins exist

### Scenario 64: a single file at LOC=SPLIT_AT
  Given a single file of LOC equal to SPLIT_AT
  When partitioned
  Then it forms one subtree leaf with that file

### Scenario 65: a solo file larger than SPLIT_AT is documented
  Given one file with LOC > SPLIT_AT in an otherwise empty directory
  When partitioned
  Then the harness records whether the algorithm produces an oversize single-bin leaf and flags this as a known limitation

### Scenario 66: zero-source-file tree
  Given a tree containing only `.md`, `.json`, and other non-source files
  When partitioned
  Then the result is an empty leaf array

### Scenario 67: only-excluded-directories tree
  Given a tree whose only directories are `node_modules` and `dist`
  When partitioned
  Then the result is an empty leaf array

### Scenario 68: __tests__ directories are excluded
  Given a tree with a `__tests__` directory containing `.ts` files
  When partitioned
  Then those test files are excluded from all leaves

### Scenario 69: .d.ts files are excluded
  Given a tree containing `Foo.d.ts`
  When partitioned
  Then `Foo.d.ts` is absent from all leaves

### Scenario 70: .tsx files are included
  Given a tree containing `Bar.tsx`
  When partitioned
  Then `Bar.tsx` appears in exactly one leaf

### Scenario 71: test siblings are excluded but their non-test siblings are not
  Given a directory containing `Foo.ts` and `Foo.test.ts`
  When partitioned
  Then `Foo.ts` is in a leaf and `Foo.test.ts` is excluded

### Scenario 72: dot-prefixed dirs are excluded
  Given a directory `.cache` containing source files
  When partitioned
  Then no file under `.cache` appears in any leaf

---

## Mutation primitives

### Scenario 73: addFile increments the partition by exactly one path
  Given fixture T
  When `addFile(path, loc)` is invoked and partition is re-run
  Then the new path appears in exactly one leaf's `files[]`

### Scenario 74: removeFile vanishes a path from all leaves
  Given fixture T containing `path P`
  When `removeFile(P)` is invoked and partition is re-run
  Then `P` is absent from every leaf

### Scenario 75: growFile updates parent subtreeLoc
  Given fixture T with file F at LOC=100 in dir D
  When `growFile(F, 50)` is invoked
  Then `F.loc` is 150 and `D.subtreeLoc` increases by 50

### Scenario 76: shrinkFile clamps at zero
  Given fixture T with file F at LOC=20
  When `shrinkFile(F, 50)` is invoked
  Then `F.loc` is clamped at 0 and the harness flags this as a saturating shrink

### Scenario 77: rename keeps leaf assignment stable
  Given fixture T where file `a.ts` is in leaf L
  When `renameFile(a.ts, b.ts)` is applied within the same dir
  Then `b.ts` is in leaf L and `a.ts` is gone

### Scenario 78: cross-leaf move surfaces in drift
  Given fixture T with file F in leaf L_A
  When `moveFile(F, dir_B)` is applied where dir_B belongs to leaf L_B
  Then F is in L_B, absent from L_A, and drift report names both leaves

### Scenario 79: empty directory is a no-op
  Given fixture T
  When `addDir(path)` adds an empty directory
  Then the partition is unchanged and drift report is empty

### Scenario 80: directory with one new file adds to a leaf
  Given fixture T
  When `addDir(path)` is invoked with one initial file
  Then partition includes the new file under exactly one leaf (a new leaf or an existing one, deterministically)

### Scenario 81: directory deletion cascades to drift report
  Given fixture T with a non-empty directory containing 8 files
  When `removeDir(path)` is invoked
  Then drift report shows all 8 files removed

### Scenario 82: composed mutations match sequential application
  Given fixture T and two mutations M1 and M2
  When applied in sequence
  Then the final state equals applying M1 then M2 independently and matches a single-shot composed mutation

---

## Determinism

### Scenario 83: fixture builder is seed-stable
  Given the fixture builder with seed S
  When invoked twice
  Then both calls produce structurally identical trees (same paths, same LOC values)

### Scenario 84: partition core is portable
  Given the same DirNode and partition core run on two machines
  When leaf manifests are compared
  Then they are byte-identical

### Scenario 85: seeded allocation reproduces exactly
  Given an allocation strategy with seed S
  When invoked twice
  Then assignments are identical

### Scenario 86: visualiser is deterministic across calls
  Given the same partition input
  When the visualiser is invoked twice
  Then output is byte-identical

### Scenario 87: drift computation is referentially transparent
  Given two PartitionRuns A and B
  When drift is computed twice
  Then both drift reports are byte-identical

### Scenario 88: balance metrics are referentially transparent
  Given a partition input
  When balance metrics are computed twice
  Then values match exactly (no floating-point drift across runs)

---

## Refactor regression

### Scenario 89: pure partitionTree matches the production CLI on real src/
  Given a DirNode built from a real `src/` snapshot
  When `partitionTree(dirNode)` is invoked
  Then the resulting `Leaf[]` is identical to the CLI's output for the same input on every field (path, scope, binIndex, binTotal, members, files, loc)

### Scenario 90: leaves.gitignored.json is byte-identical post-refactor
  Given a `leaves.gitignored.json` snapshot taken before the refactor
  When the refactored CLI is run on the same source tree
  Then the new manifest is byte-identical to the snapshot

### Scenario 91: harness anchored on leaf-toolkit's own src/
  Given a snapshot DirNode of this repo's `src/`
  When the harness partitions it
  Then the result matches today's `leaves.gitignored.json` (the harness's regression anchor)

### Scenario 92: pure partition has no filesystem reads
  Given an instrumented `fs` module
  When `partitionTree(dirNode)` is invoked
  Then no `readFileSync`, `readdirSync`, or `existsSync` calls are recorded

### Scenario 93: CLI output strings unchanged
  Given the production CLI's stdout output before the refactor
  When the refactored CLI is run on the same input
  Then the output string (e.g. "Wrote N leaves...") is character-identical

### Scenario 94: CI guards against silent drift
  Given a stored manifest snapshot in CI
  When the production partition output ever diverges from the snapshot
  Then CI fails with the offending diff in the failure message

---

## Pathological / adversarial

### Scenario 95: 5000-tiny-files fixture completes promptly
  Given a fixture of 5000 files of 1 LOC each in one directory
  When partitioned
  Then bin count is bounded by `ceil(totalLoc / SPLIT_AT)` and the harness completes in under 5 seconds

### Scenario 96: solo oversize file is reported
  Given a fixture with one file of LOC=10000 alone in a directory
  When partitioned
  Then the harness reports a leaf with `loc > SPLIT_AT` and flags it as a known oversize-leaf case

### Scenario 97: deep nesting does not stack-overflow
  Given a fixture with 12 nested directories each holding one small file
  When partitioned
  Then the recursion completes without throwing

### Scenario 98: ambiguous file stems remain unambiguous
  Given a fixture with `index.ts` in 30 different directories
  When partitioned and rendered
  Then each `index.ts` annotation includes enough path context to be unambiguous

### Scenario 99: first-fit-decreasing produces documented packing on near-equal siblings
  Given a parent directory with siblings at LOC values [800, 800, 800, 700, 700, 700]
  When partitioned
  Then the resulting bin layout matches the FFD reference packing and the harness records this baseline

### Scenario 100: full-report baseline against this repo
  Given the leaf-toolkit's own `src/` as input
  When the simulator's full report (overlap + drift-vs-itself + collision under round-robin K=4 + visualisation + balance) runs
  Then it produces a baseline document under `specs/001-leaf-allocation-sim/` that either names at least one concrete weakness with a reproducible fixture or affirms a clean bill of health with the same evidence shape
