---
name: "token-smoulder-flesh-out-work"
description: "Fill TODO markers in a token-smoulder work unit (`orchestration/<name>/work.md`) with concrete Objective / Context / Constraints / Done When prose, then drive the `token-smoulder lint` command until it returns 0. Fires on edits to files matching `orchestration/*/work.md` that contain the literal `TODO(token-smoulder)` sentinel, and on user utterances like \"flesh out this work unit\", \"fill the TODOs\", \"finish this work.md\". SKIP: speckit specs under `specs/**`; fixture work units under `tests/fixtures/**`; work units that are already lint-clean (no `TODO(token-smoulder)` sentinel); generic programming questions; other Claude Code skills, hooks, agents, slash commands, or settings."
user-invocable: true
disable-model-invocation: false
---

# Skill: token-smoulder — flesh out a work unit

## Purpose

Token-smoulder scaffolds a work unit with `token-smoulder new <name> "<one-liner>"`. The scaffold leaves four sections of `work.md` populated with `TODO(token-smoulder)` sentinels: `# Context`, `# Constraints`, `# Done When`, plus a sentinel inside `executor.ts`'s `promptFlow`. Until the sentinels are removed and the sections meet the rubric below, `token-smoulder lint <name>` exits 3 and `token-smoulder check <name>` returns `shouldRun: false`.

This skill turns the one-line idea into a lint-clean work unit by editing in place, asking the user only what cannot be inferred, and verifying with `token-smoulder lint` after each pass.

## SKIP

Do not activate when:

- The file under edit lives in `specs/**` — that is speckit territory, not token-smoulder.
- The file lives under `tests/fixtures/**` — those are deliberate test inputs and must keep their exact shape.
- The work.md does not contain the literal string `TODO(token-smoulder)` — it is already filled in. Leave it alone.
- The user is asking a generic programming question with no work unit in scope.
- The user is editing skills, hooks, agents, slash commands, settings, or any other Claude Code asset class — those are governed by other skills.

## Quality rubric

Each filled section must satisfy the bar below. The lint command checks the mechanical bits; the prose bits are this skill's responsibility.

- **`# Objective`** — one sentence, single verb, no `and` / `also`. The scaffolder writes the user's one-liner here verbatim. Do not edit it. If it does not satisfy the rule, ask the user to rewrite their one-liner before continuing.
- **`# Context`** — names every file, command, or external system the agent will touch. A fresh agent must not need to ask a follow-up question. No background that does not affect what the agent will do.
- **`# Constraints`** — explicit Do / Don't list. Justifies the `riskClass` declared in `executor.ts` (e.g., "riskClass=readonly because the agent does not write any file outside the repo").
- **`# Done When`** — one rule per line, drawn from the small grammar enforced by `token-smoulder lint`:
  - `file:<path>` — the file at `<path>` exists.
  - `exit:<command>` — running `<command>` exits 0.
  - `match:<regex>:<source>` — `<regex>` matches against `<source>` (a file path or, with the `$`-prefix, the stdout of a command).
  No "looks good", no "is complete", no "the user is happy". If the user describes a subjective stop condition, ask them to translate it into one of the three forms.

## Execution

1. **Verify scope.** Confirm the file under edit matches `orchestration/*/work.md` (not a `specs/**` or `tests/fixtures/**` path) and contains the `TODO(token-smoulder)` sentinel. If either check fails, stop — this skill does not apply.
2. **Read the orchestration name** from the parent directory and remember it; every shell call below uses it.
3. **Read the existing `# Objective` verbatim** — it is the user's one-line idea. Do not modify it.
4. **Ask the user one targeted question per unfilled section, max four total.** Frame each question as "to fill `# <Section>` I need to know X" — one decision at a time. Examples:
   - Context: "which files / commands / external systems will the agent touch?"
   - Constraints: "what must the agent NOT do, and why is `riskClass=<X>` the right declaration?"
   - Done When: "give me 1–3 mechanical PASS/FAIL checks (file:, exit:, or match:) — nothing subjective."
   - Prompt flow (if `executor.ts` still contains the sentinel): "what concrete prompt(s) should the agent run to satisfy the Objective?"
   Do not bundle questions; do not ask for free-form prose where a list will do.
5. **Edit `work.md` and `executor.ts` in place.** Replace each `TODO(token-smoulder)` block with the user's answer transcribed into the rubric form. Strip the original HTML-comment scaffolding when its content is fully replaced. Never leave a partial `TODO(token-smoulder)` string behind.
6. **Run `token-smoulder lint <name>`** via the Bash tool. Read its issue list.
7. **If lint exits 0 — done.** Tell the user the unit is ready and that `token-smoulder check <name>` will now show `shouldRun: true` (assuming quota and contention gates pass).
8. **If lint exits 3** — fix the issues it names. Common cases:
   - `todo-sentinel`: a TODO marker leaked through. Re-scan the file and remove it.
   - `done-when-grammar` / `done-when-empty`: rewrite the Done When line(s) into the supported grammar; if the user only gave subjective criteria, go back to step 4 and ask them for one of the three forms.
   - `prompt-flow-todo`: the `promptFlow` array in `executor.ts` still contains the sentinel — replace with the prompts gathered in step 4.
   Then loop back to step 6. Stop only when lint passes; do not declare success on a failing lint.
9. **If lint exits 5 (boundary error)** — the orchestration could not be loaded. Surface the underlying error to the user and stop. Do not edit further.

## Why this shape

- **`token-smoulder lint` is the closed loop.** Without a mechanical check, the skill would be self-grading prose against subjective taste. With it, the skill stops only when the dispatcher will actually accept the work unit.
- **One question per section, max four.** Bundling questions invites the user to reply with a single hand-wave that doesn't map to any section.
- **Edit in place, no scratch files.** The user already chose this work unit's path with `token-smoulder new`; the skill does not introduce a separate draft surface.
