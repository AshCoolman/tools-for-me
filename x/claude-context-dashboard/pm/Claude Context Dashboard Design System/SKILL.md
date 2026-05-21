---
name: claude-context-dashboard-design
description: Use this skill to generate well-branded interfaces and assets for Claude Context Dashboard, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick start

- **Stylesheet**: `colors_and_type.css` — drop into any HTML to inherit the full system (page bg, fg ramp, severity colors, type scale, mono font).
- **UI kit**: `ui_kits/dashboard/index.html` — full sessions view with header, chart, severity bands, and session rows. Use as a layout reference and copy components from it.
- **Cards**: `preview/*.html` — atomic specimens for type, color, components, and brand. Useful for grounding a new screen in the existing system.
- **Iconography**: unicode glyphs (`⌕ ⊘ ✓ ×`) and 14px hand-drawn 1.5px-stroke SVGs only. No emoji. No icon library.

## Non-negotiable rules

1. **Color is reserved for severity.** Green / yellow / orange / red encode token bands (Fast / Medium / Large / Critical). Don't use them decoratively.
2. **One surface tone.** `#101114` page, `#27272a` 1px borders. No raised panels, no tonal cards. Borders distinguish surfaces.
3. **Hover/focus are loud, not subtle.** Hover lifts borders to `#a1a1aa` (4 zinc steps). Focus stamps a 2px white outline. They have to compete with severity colors.
4. **Numbers are tabular & abbreviated.** Always `font-variant-numeric: tabular-nums` and `12k / 1.2M / 3m ago`.
5. **Sentence case.** Never Title Case for UI strings. Estimates are always labelled ("≈", "approximate").
6. **No emoji ever.**
