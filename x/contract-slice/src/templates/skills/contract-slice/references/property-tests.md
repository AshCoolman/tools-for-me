# Property Tests

Property tests verify invariants across a broad input space, not just specific examples.

## When to use

Use property tests when:
- the input space is large (strings, numbers, arrays, objects)
- you have a clear invariant that should hold for all valid inputs
- you want to find edge cases the author didn't anticipate
- the function is a pure transform (no side effects)

Use example tests when the important cases are specific and enumerable.

## fast-check basics

```ts
import { expect, it } from 'vitest';
import * as fc from 'fast-check';

it('sort is idempotent', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (arr) => {
      const once = [...arr].sort();
      const twice = [...once].sort();
      expect(twice).toEqual(once);
    })
  );
});
```

## Common arbitraries

```ts
fc.string()          // any string
fc.integer()         // any integer
fc.float()           // any float
fc.boolean()         // true or false
fc.array(fc.string()) // array of strings
fc.record({ id: fc.string(), n: fc.integer() }) // object
fc.oneof(fc.string(), fc.integer()) // one of multiple types
fc.constantFrom('a', 'b', 'c') // one of specific values
```

## Round-trip property

Useful for serialization/deserialization:

```ts
fc.assert(
  fc.property(UserSchema.arbitrary(), (user) => {
    const encoded = serialize(user);
    const decoded = deserialize(encoded);
    expect(decoded).toEqual(user);
  })
);
```

## Shrinking

When fast-check finds a failing case, it automatically shrinks the input to the minimal failing example. This is one of its key advantages over manual examples.

## Limits

Property tests are slow for large input spaces. Cap with `{ numRuns: 100 }` (default is 100). Keep property tests in a separate describe block so they can be skipped in watch mode.
