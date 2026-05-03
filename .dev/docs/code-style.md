# FE Code Style Guide for AI Agents

Default: Airbnb JavaScript Style Guide.

Overrides below matter more for this repo. If you break one, justify it in the PR.

## Prime directive

Make the smallest safe change that satisfies the request.

Do not reformat, reorder, rename, move code, upgrade deps, invent abstractions, weaken tests, or change runtime behaviour unless required.

Follow the nearest local pattern: same file → folder → package → repo guide.

## Errors

Do not swallow errors.

Caught errors must be reported, converted to an error state, rethrown, or explicitly ignored with a reason.

```ts
try {
  await optionalTelemetryFlush();
} catch {
  // Intentionally ignored: telemetry must not block navigation.
}
```

## Boundaries

Treat boundary operations as fallible: `JSON.parse`, `new URL`, `fetch`, schema parsing, storage, SDKs, `structuredClone`, scripts/process calls.

Handle locally or intentionally bubble.

## Regex

Bias away from new bespoke regex.

Prefer native APIs, existing helpers, parsers, or tested libraries. If regex is right, name it and comment intent.

## Naming / provenance

Resist renaming values, even if they crossed env/client/server boundaries.

Preserve external names in boundary-shaped code when traceability matters.

```ts
const config = {
  env: {
    SEARCH_APP_URL: env.SEARCH_APP_URL,
  },
};
```

If backend-shaped names leak across normal FE files, adapt once near the boundary.

```ts
const toQuestion = (raw: RawQuestion): Question => ({
  semanticId: raw.semantic_id,
  displayText: raw.display_text,
});
```

Raw API layer may keep backend naming. App/rendering layer should normally use FE naming.

## Barrels

Use barrels only for intentional public boundaries.

```ts
export { QuestionCard } from './QuestionCard';
export type { QuestionCardProps } from './QuestionCard';
```

## TypeScript

Use `unknown` at trust boundaries; narrow immediately.

Use `any` only when the type cannot reasonably be expressed, and explain it.

Derive types instead of duplicating shapes: generated types, `Pick`, `Omit`, `ReturnType`, `Parameters`, `Awaited`, indexed access, `z.infer`.

Do not change runtime behaviour while fixing types. Be careful with `||` → `??`, `== null` → `=== null`, truthiness, spread order, defaults, catch behaviour, and sync/async changes.

`interface` vs `type`: follow nearby code. Use `type` for unions/derived shapes.


## Typeguarding

Zod is good.

## Data transformation

Transform early for broadly useful semantic types: raw config → validated config, string timestamp → `Date`, raw API response → domain model.

Transform late for use-case/rendering-specific data: local formatting, labels, colours, chart-only shapes.

Avoid ad hoc middle transformations. Use a named layer if transformation sits in the middle: adapter, selector, service, parser, presenter, view model.

## Config

Prefer expressive discriminated config over mixed bags.

```ts
type MapConfig =
  | { type: 'MapTiler'; token: string }
  | { type: 'Esri'; offline: boolean; mapStyle: string };
```

Local-only config may be `VITE_DEV_*` / `REACT_DEV_*`.

## React

Keep effects narrow and idempotent.

Do not suppress hook dependency lint just to pass. Prefer stable callbacks, query libraries, cleanup, module helpers, or idempotent effects.

Do not add `useMemo`, `useCallback`, `memo`, caches, or identity tricks without a concrete reason.

## Tests

Do not weaken tests to pass.

Do not delete assertions, widen expectations, overuse `data-testid`, mock the unit under test, oversimplify fixtures, blindly update snapshots, skip tests, or mark flaky without evidence.

Use the local test style. Do not introduce new wrappers, fixtures, assertions, mocks, or network tools unless required.

Tell a story with tests. Diff snapshots to simplify. Inline snapshots are good. 

If testing an arrays of input-for-scenario, map over results to create a human readable report.

## Scripts

Scripts should fail clearly and safely.

Prefer fail-fast, input validation, quoted paths, PASS/FAIL output, non-destructive defaults, dry-run where practical, macOS/Linux portability, and useful diagnostics.

If a script is very likely to stay small, low churn, simple - shell script is ok. Else use Inquirer with mts.

Try to hand-hold and automate maximally. If you can infer - or pre-search - or store and re-use, then do it.

## D3

Keep ownership explicit.

D3 may own calculations/layout/low-level drawing. React owns app state, lifecycle, and composition.

Separate domain graph data, computed layout data, collapsed/expanded state, hover/selection state, and animation state.

## Final rule

Optimize for reviewability: small, local, typed, tested where appropriate, consistent with nearby code, explicit about risk, easy to revert.

## Code Comments

Resist - instead gain clarify via naming, structure and context.
