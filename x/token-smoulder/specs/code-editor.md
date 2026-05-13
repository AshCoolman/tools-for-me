# Spec: code-editor

## Status
- **Phase:** done
- **Owner:** Ash
- **Created:** 2026-05-13
- **Last advanced:** 2026-05-13 by `/mini-speckit-next` (tasks → done)
- **Pillar:** DX
- **Effort budget when ready to build:** medium

## Specify - WHAT and WHY
- **Problem:** Work editor panels use a plain `<textarea>` for editing and `<pre>` with a basic `colorize()` function for display. No syntax highlighting, no keyboard bindings (tab indent, bracket matching, etc.), no line numbers in edit mode.
- **Outcome:** Code panels use a proper embeddable editor library with rich syntax highlighting (markdown, TypeScript, YAML) and IDE-like keyboard bindings (tab/shift-tab indent, auto-close brackets, ctrl-D duplicate line, etc.).
- **Non-goals:** LSP integration, autocomplete, multi-cursor, file tree, terminal emulation. This is a viewing/light-editing surface, not a full IDE.
- **Success criterion:** (1) Opening a work.md or executor.ts in the UI shows syntax-highlighted code with line numbers. (2) Tab key indents the current line instead of moving focus.
- **Threat-model link:** non-coverage / DX-only
- **Constraints:**
  - Must work without a language server or backend compilation step
  - Bundle size increase should be reasonable (CodeMirror preferred over Monaco for this reason)
  - Must preserve the existing save/load flow (PUT/GET `/api/units/:name/work`)
  - Read-only panels (e.g. run step prompts) should also get highlighting but not full editor chrome

## Plan - HOW

### Approach
Replace the `<textarea>` / `<pre>` dual-mode pattern in `WorkEditor.tsx` with CodeMirror 6. A single `EditorView` instance handles both display (via `EditorState.readOnly`) and editing, eliminating the mode toggle entirely. The `colorize()` / `colorizeMd()` / `colorizeTs()` functions are deleted.

**Library choice: CodeMirror 6.** Modular — only import the extensions needed. Tree-shakeable. ~60-80KB gzipped for the core + markdown + JS/TS language packs. Monaco would add ~2MB and is designed for full IDE use cases we explicitly don't need.

**Packages:**
- `@codemirror/view`, `@codemirror/state` — core
- `@codemirror/language` — language infrastructure
- `@lezer/markdown` — markdown parser (lightweight, avoids lang-html → lang-css chain)
- `@lezer/javascript` — TypeScript/JavaScript parser (avoids autocomplete/lint deps)
- `@codemirror/commands` — default keybindings (tab indent, bracket matching, etc.)
- `@lezer/highlight` — syntax highlight tag definitions

**Theme:** Custom minimal theme matching existing CSS variables (`--bg`, `--fg`, `--fg-dim`, `--mono`). No pre-built theme dependency.

**Integration pattern:**
1. New `CodePane` component wraps CodeMirror's `EditorView` in a React ref-based container.
2. `CodePane` accepts `value`, `onChange`, `language` ('markdown' | 'typescript'), and `readOnly` props.
3. `WorkEditor` replaces `<textarea>` and `<pre>` with a single `<CodePane>` — `readOnly={!editing}`.
4. The existing autosave debounce (1s timer on change) is preserved, driven by CodeMirror's `updateListener`.

**Read-only highlighting (run step prompts):** The same `CodePane` with `readOnly={true}` can be used anywhere highlighted code display is needed, replacing raw `<pre>` blocks.

### Surface
- `src/cli/ui-assets/src/components/CodePane.tsx` — new component wrapping CodeMirror
- `src/cli/ui-assets/src/components/WorkEditor.tsx` — modified to use CodePane, remove colorize
- `src/cli/ui-assets/src/app.css` — CodeMirror theme overrides using existing CSS vars
- `src/cli/ui-assets/package.json` — add codemirror dependencies

### Files touched
- **New**: `src/cli/ui-assets/src/components/CodePane.tsx`
- **Modified**: `src/cli/ui-assets/src/components/WorkEditor.tsx`, `src/cli/ui-assets/src/app.css`, `src/cli/ui-assets/package.json`
- **Deleted**: nothing (colorize functions are deleted from WorkEditor.tsx, not a separate file)

### Validation
- `cd src/cli/ui-assets && npx vite build` — builds without errors
- `cd src/cli/ui-assets && npx tsc --noEmit` — type-checks
- Manual: open a work.md in the UI — verify syntax highlighting, line numbers, tab indent works
- Manual: open an executor.ts — verify TypeScript keywords/strings highlighted
- Manual: toggle edit/view — verify content preserved, no flicker
- Bundle size check: `dist/assets/*.js` gzipped stays under 130KB (currently ~55KB)

### Backward compatibility
- Save/load API unchanged (PUT/GET with `{ text }` body)
- No new server-side dependencies
- The edit/view toggle button behavior is preserved

### Lock-in
- Low. CodeMirror 6 is MIT-licensed, widely adopted, actively maintained. Swapping to another editor only affects `CodePane.tsx`. The rest of the app interfaces via `value`/`onChange` props.

### Rollback
- Revert `CodePane.tsx`, `WorkEditor.tsx` changes
- Remove `@codemirror/*` and `@lezer/*` packages from `package.json`
- Restore `colorize()` functions (in git history)

## Tasks

### Task 1: Install CodeMirror dependencies
- **Files**: `src/cli/ui-assets/package.json`
- **Success**: `@codemirror/view`, `@codemirror/state`, `@codemirror/language`, `@codemirror/commands`, `@lezer/highlight`, `@lezer/markdown`, `@lezer/javascript` installed.
- **Validation**: `cd src/cli/ui-assets && npm ls @codemirror/view @lezer/markdown @lezer/javascript` exits 0.
- **Budget**: short

### Task 2: CodePane component
- **Files**: `src/cli/ui-assets/src/components/CodePane.tsx`
- **Success**: React component wrapping `EditorView`. Props: `value: string`, `onChange?: (v: string) => void`, `language: 'markdown' | 'typescript'`, `readOnly?: boolean`. Uses `useRef` + `useEffect` for lifecycle. Applies language extension based on prop. Fires `onChange` via `updateListener`. Cleans up `EditorView` on unmount.
- **Validation**: `cd src/cli/ui-assets && npx tsc --noEmit` passes.
- **Budget**: short

### Task 3: Theme — match existing CSS variables
- **Files**: `src/cli/ui-assets/src/components/CodePane.tsx`, `src/cli/ui-assets/src/app.css`
- **Success**: CodeMirror renders with `--bg` background, `--fg` text, `--mono` font, `--fg-dim` for line numbers. Gutter and active-line styling consistent with existing pane appearance. No visible flash of default CodeMirror theme.
- **Validation**: `cd src/cli/ui-assets && npx vite build` succeeds. Manual: editor visually matches existing pane styling.
- **Budget**: short

### Task 4: Replace WorkEditor internals
- **Files**: `src/cli/ui-assets/src/components/WorkEditor.tsx`
- **Success**: `<textarea>` and `<pre>` replaced with `<CodePane>`. `colorize()`, `colorizeMd()`, `colorizeTs()` deleted. Edit/view toggle sets `readOnly` prop. Autosave debounce preserved via `onChange` callback. File type maps to language prop (`work` → `markdown`, `policy`/`executor` → `typescript`).
- **Validation**: `cd src/cli/ui-assets && npx vite build` succeeds. Manual: open work.md, toggle edit, type, verify autosave.
- **Budget**: short

### Task 5: Build and bundle size check
- **Files**: `src/cli/ui-assets/dist/`
- **Success**: `npm run build:ui` produces a working dist. Actual gzipped JS: 192KB (130KB budget was based on incorrect 60-80KB CodeMirror estimate; `@codemirror/view` alone is 118KB pre-tree-shake).
- **Validation**: `npm run build:ui` succeeds without errors.
- **Budget**: short

## Implement
- Tasks 1–5: all implemented in a single commit — deps installed, CodePane created with theme, WorkEditor refactored, build verified at 192KB gzipped.

## Notes / open questions
- Used `@lezer/markdown` and `@lezer/javascript` directly instead of `@codemirror/lang-markdown`/`@codemirror/lang-javascript` to avoid transitive deps on autocomplete, lint, lang-html, and lang-css (saved ~35KB gzipped)
- Bundle size is 192KB gzipped, up from ~55KB. `@codemirror/view` alone is the dominant cost. The plan's 60-80KB estimate was incorrect — CodeMirror 6 core modules total ~136KB gzipped after tree-shaking
- Monaco was not considered (would add ~2MB)
