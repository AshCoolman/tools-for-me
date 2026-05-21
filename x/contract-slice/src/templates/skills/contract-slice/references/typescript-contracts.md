# TypeScript Contracts

Patterns for expressing Contract Slice contracts in TypeScript.

## Compiler as first gate

Enable these in `tsconfig.json`:
```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true
}
```

Failing `tsc --noEmit` is a hard gate — treat it like a failing test.

## Narrowed union types

Prefer discriminated unions over optional fields at external boundaries:

```ts
// Weak
interface Result { value?: string; error?: string; }

// Strong
type Result = { ok: true; value: string } | { ok: false; error: string };
```

## Type-level tests

Use `expectTypeOf` (Vitest) or `tsd` to assert public API shape:

```ts
import { expectTypeOf } from 'vitest';
expectTypeOf(parseUser).returns.toMatchTypeOf<User>();
expectTypeOf(parseUser).parameter(0).toBeString();
```

These tests fail at type-check time, not runtime — they document and enforce the contract.

## Exhaustiveness checks

Add a `never` branch to detect unhandled cases:

```ts
function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${String(x)}`);
}

switch (status) {
  case 'PASS': return handlePass();
  case 'WARN': return handleWarn();
  case 'FAIL': return handleFail();
  default: return assertNever(status);
}
```

## Const enums and branded types

Prefer `as const` string literals over loose strings for contract values:

```ts
const FILE_ACTIONS = ['CREATE', 'SKIP', 'OVERWRITE'] as const;
type FileAction = (typeof FILE_ACTIONS)[number];
```

Branded types prevent confusion between structurally identical values:

```ts
type UserId = string & { readonly __brand: 'UserId' };
type OrderId = string & { readonly __brand: 'OrderId' };
```
