# @ashcoolman/contract-slice

Intent in. Contracts out. Code gated.

Contract Slice turns loose implementation intent into AI-generated contracts, tests, and gates before coding.

## Why

Early specificity is often fake. Contract Slice starts with intent, then uses AI to discover and review the useful contracts before implementation begins.

## Workflow

```
Intent → Contract Discovery → Review → Tests/Gates → Implementation → Verification
```

## Install

```sh
pnpm dlx @ashcoolman/contract-slice init
```

Or install locally in your project:

```sh
pnpm add -D @ashcoolman/contract-slice
pnpm cslice init
```

## What gets generated

Running `cslice init` in a project root creates:

```
.claude/
└── commands/
    ├── cslice.intent.md
    ├── cslice.contract.md
    ├── cslice.review.md
    ├── cslice.tests.md
    ├── cslice.implement.md
    └── cslice.verify.md

.dev/
└── contract-slice/
    ├── contract-slice.md
    ├── theory.md
    ├── intent-template.md
    └── contract-template.md

scripts/
└── cslice-verify.sh
```

Use `--skill` to also install compact Claude skill reference files:

```
.claude/
└── skills/
    └── contract-slice/
        ├── SKILL.md
        └── references/
            ├── theory.md
            ├── typescript-contracts.md
            ├── runtime-schemas.md
            ├── property-tests.md
            ├── failure-modes.md
            └── hard-gates.md
```

## Claude commands

Use these slash commands with Claude Code or any Claude interface:

| Command | Purpose |
|---|---|
| `/cslice.intent` | Turn loose intent into a bounded Contract Slice input |
| `/cslice.contract` | Discover contracts, invariants, edge cases, and gates |
| `/cslice.review` | Review a contract before tests or implementation |
| `/cslice.tests` | Generate tests from the contract |
| `/cslice.implement` | Implement inside the generated guardrails |
| `/cslice.verify` | Verify implementation against the contract and hard gates |

## Commands

```sh
cslice init                  # Install commands + scripts + docs (default)
cslice init --skill          # Also install skill reference files
cslice init --claude-commands # Install only the six command files
cslice init --scripts        # Install only cslice-verify.sh
cslice init --all            # Install everything
cslice init --dry-run        # Preview what would be installed
cslice init --force          # Overwrite existing files
cslice init --target <dir>   # Install into a specific directory

cslice doctor                # Check installation health
cslice doctor --target <dir>

cslice print intent          # Print the intent template to stdout
cslice print verify          # Print the verify template to stdout
```

## Theory

Contract Slice works best in contract-friendly tech stacks where correctness can be expressed as compiler checks, runtime validation, tests, and hard gates.

Best fits:
- Rust
- TypeScript with runtime schemas (Zod, Valibot, ArkType)
- TypeScript with strict compiler settings
- schema-heavy systems
- data transforms and ranking/sorting logic
- API adapters and serialization/deserialization

TypeScript types are erased at runtime, so Contract Slice works best in TypeScript when paired with runtime schemas, type-level tests, property tests, and shell gates.

See `.dev/contract-slice/theory.md` (installed by `cslice init`) for the full theory.
