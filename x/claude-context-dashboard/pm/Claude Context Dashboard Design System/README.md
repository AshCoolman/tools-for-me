# Claude Context Dashboard — Design System

A design system for **Claude Context Dashboard**: a local web tool that surfaces every Claude Code session on your machine in one view — per-session context fullness over time, total token usage, plan-limit calibration, and macOS notifications when sessions approach context limits.

The product reads `~/.claude/projects/**/*.jsonl` and visualizes it. The design's job is to let dense, time-series, multi-session data **speak for itself**: austere chrome, loud severity signals, monospace numbers, and many small encodings rather than one big chart.

## Source

- **Codebase** (read-only, mounted): `claude-context-dashboard/` — React 19 + d3 + Fastify
- **Repo**: https://github.com/AshCoolman/tools-for-me/tree/main/x/claude-context-dashboard

Key files referenced when building this system:
- `src/client/styles.css` — full CSS surface (1795 lines)
- `src/client/App.tsx` — top-level layout, header, status chip
- `src/client/SessionsPage.tsx` — session list, severity bands, sparklines
- `src/client/Chart.tsx` — d3 line/area chart with severity bands
- `src/client/UsageStrip.tsx` — stacked usage layers (input/output/cache)
- `src/client/Settings.tsx` — settings storage and defaults

## Index

- `README.md` — this file
- `colors_and_type.css` — design tokens (color, type, spacing, radius)
- `fonts/` — Inter + JetBrains Mono (Inter is the source font; mono is a near-match for ui-monospace)
- `assets/` — logo placeholder, status-chip icons
- `preview/` — Design System cards (one HTML per concept)
- `ui_kits/dashboard/` — UI kit recreating the dashboard's screens
- `SKILL.md` — agent skill manifest

---

## Content Fundamentals

The product is a **super-user developer tool**, and the copy treats the reader as a peer who already knows what tokens, context windows, and `/compact` mean.

**Tone.** Plain, lowercase-first, technical, declarative. No marketing voice, no exclamation marks, no encouragement. Sentences are short and structural. Code identifiers (`/api/data`, `~/.claude/projects/`, `POST /api/usage`) appear inline in copy, in `<code>` tags.

**Casing.** Sentence case for everything — headings, labels, buttons. Tabs are abbreviated and lowercase (`24h`, `6h`, `1h`, `20m`, `1m`). Severity band labels are Title-cased single words: **Fast**, **Medium**, **Large**, **Critical**.

**Voice.** Third-person impersonal — describes the system, not the user. "Showing 12 of 47 sessions". "Last payload is stale." Rarely uses "you" — when it does, it is direct and operational ("Have your usage source `POST /api/usage` …").

**Hedging is explicit, not soft.** Every estimate is labelled `(est.)`. The README opens with a "Caveat" section. The page blurb reads: *"Context fullness is an estimate derived from JSONL session logs and may not match Claude Code's live context window."* Honesty about precision is a brand value.

**Numbers everywhere.** Token counts use `12k`, `1.2M`, `300k`. Times use relative-then-absolute (`3m ago` → `Jan 12 14:32`). All numbers are tabular-nums.

**Examples.**
- Band header: *"150k–300k — long session; consider /compact soon."*
- Search placeholder: *"Filter project, session id, or chat"*
- KPI label: *"Avg context full (est.)"*
- Tooltip metric label: `ctx` / `cum` (10px uppercase, letter-spaced)
- Status chip: *"All Systems Operational"* (passed through verbatim from status.claude.com)

**No emoji. No icons-as-emoji.** The single Unicode glyph used in the UI is `⌕` (search) and `⊘` (orphan-session indicator). That's it.

---

## Visual Foundations

**Mood.** A late-night terminal. Black, dim, monospace where it counts. The eye is meant to land first on the loud severity signals (red/orange dots, fill bars, big background project names) and then drill into dense rows beneath.

**Color.**
- Page background is `#101114` (warmer than pure black). The body tints **amber** (`#2a2008`) when status.claude.com reports a minor incident, and **deep red** (`#2a0d0d`) on a major incident — the entire page background changes, not just a chip.
- Surfaces step up in 4 zinc tones: `#101114` page → `#18181b` cards → `#1f1f23` inputs → `#27272a` hover/active. Borders are `#27272a` → `#3f3f46` (hover) → `#52525b` (focus) → `#71717a` (selected text).
- Foreground text: `#f4f4f5` primary, `#e4e4e7` secondary, `#d4d4d8` tertiary, `#a1a1aa` muted, `#71717a` dim, `#52525b` very dim.
- **Severity scale** — the most important color decision in the product: green `#22c55e` (Fast, <50k) → yellow `#eab308` (Medium, 50k–150k) → orange `#f97316` (Large, 150k–300k) → red `#ef4444` (Critical, 300k+). Each band has a paler text variant for use on dark surfaces (`#4ade80`, `#fbbf24`, `#fdba74`, `#fca5a5`).
- **Usage layers** (the stacked area in the activity strip): blue `#60a5fa` input, purple `#c084fc` output, teal `#2dd4bf` cache read, amber `#fbbf24` cache create.
- **Per-session colors** are auto-generated. A project gets a hue from `hashHue(projectName)` at S=70%, L=65%; sessions within that project shift L by ±0.16 deterministically from the session id. Users can override per-project or per-session with a 18×18 color-swatch input.

**Type.** Inter (variable, 100–900) for everything but identifiers and numbers. ui-monospace stack (SFMono-Regular / Menlo / fallback to JetBrains Mono) for: session ids, tail/prompt previews in tooltips, `<code>` snippets, and sometimes the column-aligned token deltas. Display sizes are restrained: h1 28px, "stat" KPI 24px, h2 16px, body 13–14px, dense table rows 12px, axis ticks 11px, micro-labels 10–11px uppercase with `letter-spacing: 0.06em`.

**Backgrounds.** No images. No gradients on surfaces. The only gradients are functional:
1. Severity-band fills behind the chart (color → transparent, opacity 0.1 at top fading to 0).
2. Per-row sparkline area fills (low-opacity left → high-opacity right, so the most recent value is loudest).
3. The `feature-toggle` element animates a 4-stop linear gradient with `background-size: 400%` and a 0.46s flow keyframe — the only "decorative" animation in the system, reserved for the edit-mode toggles.
The header has a `mask-image` linear-gradient to fade scroll content underneath.

**Typography on data.** Big background project names sit at 56px, weight 800, opacity 0.25 — a "watermark" inside each session row that the chart line/sparkline overlays.

**Animation.** Almost none. The two cases:
1. `active-dot--awaiting`: a 1.6s ease-in-out infinite pulse ring around the yellow dot when a session is awaiting reply.
2. Status-chip dot: ambient `box-shadow` ring at the same color, no animation.
Page transitions are 400ms `ease` for `background-color` only (status changes). Hover transitions are 0.12–0.15s ease. Nothing bounces, nothing slides in.

**Hover states.** Surfaces lighten by one zinc step (`#18181b` → `#27272a`). Borders lighten by one (`#3f3f46` → `#52525b`). Text-links go `#71717a` → `#d4d4d8` and underline-color brightens. Copyable elements drop opacity to 0.85 then to 0.55 briefly when copied.

**Press states.** None — buttons just commit on click. Inputs get a 3px halo on focus (`box-shadow: 0 0 0 3px rgba(161,161,170,0.12)`).

**Borders + radii.** 1px solid is the only border weight (1.5px on session rows when active, 2px on focused color-swatches). Radii: 4px (tags, swatches), 6px (modal close, settings inputs), 8px (cards, buttons, inputs, status chip), 10px (session rows), 12px (modal), 999px (status chip pills, dots).

**Shadows.** No drop-shadows on cards. The only shadows are:
- Session-row text gets aggressive multi-stop text-shadow over the sparkline background so labels stay readable: `0 1px 2px / 0 2px 4px / 0 0 8px / 0 0 14px / 0 0 22px` of varying black opacity. This is signature.
- Modal: `0 18px 48px rgba(0,0,0,0.6)`.
- Tooltip: `0 6px 18px rgba(0,0,0,0.55)`.
- Status-chip dot: `box-shadow: 0 0 0 3px rgba(<color>, 0.18)` — a colored aura.

**Cards.** No card backgrounds, no borders. `.card` is `padding: 0; margin-bottom: 24px;`. The "card" affordance is purely the `<h2>` + `<p class="card-blurb">` + content stack. Cards bleed into the page; the visual rhythm comes from spacing, not containers. The exception is the modal and dismissed-panel, which DO have `#18181b` background + `#3f3f46` border.

**Layout.** Sticky header at top with `z-index: 20` and a fade mask. Page width `min(1500px, 100vw - 48px)`. Two settings buttons absolutely positioned top-right of the header (visibility, settings).

**Transparency / blur.** Reserved for the modal backdrop (`rgba(0,0,0,0.55)` + `backdrop-filter: blur(2px)`). Severity tags use 15% alpha (`rgba(34,197,94,0.15)`) over the dark surface.

**Imagery vibe.** N/A — no photography, no illustration. The product itself is the imagery: dense, multi-color time series.

**Layout rules.** Tabular numbers everywhere (`font-variant-numeric: tabular-nums`). Time labels get small-caps (`font-variant-caps: all-small-caps`). Right-aligned numeric inputs in settings.

---

## Iconography

**Approach: minimal, characterful, unicode-first.**

The product ships with **no icon library** and **no SVG icon set**. Everything that looks like an icon is either:

1. **A unicode glyph used in-flow.** `⌕` for search (header input affordance), `⊘` appended to orphan project names. Total icon count in the actual product: 2.
2. **A small inline SVG drawn ad-hoc** for the visibility/settings buttons in `Features.tsx` (eye + cog, ~14×14, 1.5px stroke). These are hand-drawn paths, not from a library.
3. **Pure CSS shapes** — the `active-dot` (8–16px circles, optional ring + animation), the severity `band-divider__chip` (10×10 colored rounded square), the `usage-strip__legend-swatch` (8×8 rounded squares).

**Substitution policy.** When a designer needs more iconography (e.g. for a settings panel illustration, a tooltip helper, an empty state), the documented choice is **Lucide** (`https://unpkg.com/lucide@latest`) — same stroke-based aesthetic, 1.5–2px strokes, rounded line caps, 16–20px sizing. This is a **substitution flag**: the codebase itself does not depend on Lucide; we adopt it here for design extensibility.

**Emoji policy.** Never. Emoji break the austere mood and don't render consistently across platforms. Use unicode geometric/mathematical glyphs (⌕, ⊘, ⊙, ⌬, ⎯, ↗, ↘, →) when an inline glyph is needed.

**Logo.** The product has no published wordmark. We treat the title `Claude Context Dashboard` set in Inter 600 with `letter-spacing: -0.01em` as the wordmark. A small monogram (`assets/monogram.svg`) renders the four severity dots in a 2×2 grid as a geometric brand mark for tabs / favicons.

---

## Caveats and substitutions

- **Inter** — the codebase loads Inter via system + CDN fallback; we ship the Inter variable woff2 in `fonts/`.
- **Mono font** — the codebase requests `ui-monospace, SFMono-Regular, Menlo` (system stack only). For environments without those, we ship **JetBrains Mono** as the fallback. **Substitution flag** — flag to user if exact ui-monospace match required.
- **Logo** — no logo exists in the repo; the monogram in `assets/monogram.svg` is original to this design system.

