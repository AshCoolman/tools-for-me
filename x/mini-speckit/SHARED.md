# mini-speckit SHARED

Common rules `/mini-speckit-next` references. Slimmed copy scoped to what mini-speckit actually needs — independent of any parent repo. Bundle this with the rest of `mini-speckit/` and the layer is self-contained.

---

## Inventory sources

- `specs/*/work.md` (single-file, mini-speckit format) — the only artefacts `/mini-speckit-next` advances. Look for `## Status` with a `Phase:` line; files without that line are not mini-speckit specs.
- `NEXT.md` at repo root — free-form human (+ auto) nominations; top of the list wins.
- `git log --oneline -30` — recent direction; abandoned attempts.

---

## Override: NEXT.md nominations

Before scoring, check `NEXT.md` at the repo root. Free-form numbered list. Top wins.

For each entry, infer:
- **What it is** (a spec path, a one-line task, a feature name)
- **Roughly how big** (use the entry's text + any linked spec to estimate budget — short / medium / long)

If the top entry's inferred budget matches the invoked command, work on it. Skip entries too vague to act on; surface a one-line warning. Do not enforce a schema. NEXT.md is for humans.

---

## Hard demotions (apply BEFORE the rung table)

A candidate falls to **score 0.05** (bare-idea floor) regardless of how much text exists, if any of the following are true:

- `Status: NOT VETTED` or any equivalent tag in the spec.
- A "Vetting needed" / "Decision criteria" / "Open questions" block names dependencies that come from **outside the team** (vendor APIs whose existence isn't confirmed, legal review of T&Cs, latency/cost measurement requiring vendor access, regulatory sign-off).
- The spec has `Phase: blocked` in its Status block.
- The next rung's success criteria depend on info no one in the team can produce in this session.

**Why:** an idea written about for hours but blocked on a vendor's product reality is further from shipping than a sparse but unblocked idea.

---

## Quality bars (apply during build of any rung output)

- **DX/ergonomics:** discoverable; consistent with surrounding style; `-h`/`--help` and `--dry-run` where relevant; fail-loud with actionable error messages; silence-on-clean as the floor.
- **Security:** fail-closed; new deny rules paired with narrowest viable allow; new hooks must have a stdin-JSON contract and non-zero exit on block; secrets never echoed back to stderr/stdout.
- **Auditability:** small files, explicit names, comments only on WHY; JSON keeps `$schema`; conventional commits with informative bodies.
- **Idiomatic:** match conventions present in the file you're editing — do not introduce a new style.
- **Spec advances:** every phase block you close must already declare its own success criterion; if it doesn't, fix that first.

---

## Validation matrix (light — adapt to the destination repo)

1. Markdown of new artefacts parses; no broken internal links.
2. For task implementations: run the task's Validation commands and confirm they pass before committing.
3. If the destination repo provides a diff-review skill, invoke it against the staged + working diff before committing — fix any Blocking items in-loop. (Skip silently if none is configured.)

---

## Commit discipline

- Conventional Commits, scope `mini-spec`. Subject ≤ 72 chars.
- Body explains WHY (closer to shippable, blocks downstream, etc.), not WHAT.
- Stage explicitly. Never `git add -A`.
- Prefer multiple small commits over one large one when work is independent.

---

## Notes (apply always)

- Refactor only what blocks the change. Do not expand scope into a clean-up pass.
- If you find an unsafe pattern out of scope, log it in the spec's `## Notes / open questions` block rather than fixing inline.
- Never skip git hooks (`--no-verify`).
- Never amend a published commit.

---

## Discipline

mini-speckit and full speckit are deliberately disjoint systems. The
only valid next step from any mini-speckit command is another
mini-speckit command (`/mini-speckit-specify`, `/mini-speckit-next`)
or stop.

Never:
- invoke `/speckit.*` from a mini-speckit command
- suggest `/speckit.*` as a "fallback" or "heavier-weight" option
- name `/mini-speckit-plan`, `/mini-speckit-tasks`,
  `/mini-speckit-implement`, or any other rung-named command — they
  do not exist; only `/mini-speckit-next` advances rungs

When the next mini-speckit step isn't obvious, stop. Do not paper
over the gap with a command from another system.
