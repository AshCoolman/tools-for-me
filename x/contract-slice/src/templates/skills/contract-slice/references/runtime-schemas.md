# Runtime Schemas

Runtime schemas compensate for TypeScript's type erasure at trust boundaries.

## When to use

Apply schemas at every trust boundary:
- external API responses
- user input / form data
- config files
- environment variables
- inter-process messages
- localStorage / cookies
- CLI arguments from users

Do not apply schemas to internal in-process data already validated at entry.

## Parse, don't validate

Prefer parsers that return typed values over validators that return booleans:

```ts
// Validator (weak — still untyped after check)
if (isUser(data)) { /* data is still unknown-ish */ }

// Parser (strong — returns typed value or throws)
const user = UserSchema.parse(data); // typed User
```

## Zod example

```ts
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
});

type User = z.infer<typeof UserSchema>;

// At the API boundary:
const user = UserSchema.parse(rawApiResponse);
```

## Valibot example

```ts
import * as v from 'valibot';

const UserSchema = v.object({
  id: v.string([v.uuid()]),
  email: v.string([v.email()]),
  role: v.picklist(['admin', 'member']),
});

type User = v.InferOutput<typeof UserSchema>;
```

## ArkType example

```ts
import { type } from 'arktype';

const User = type({
  id: 'string.uuid',
  email: 'string.email',
  role: "'admin' | 'member'",
});

type User = typeof User.infer;
```

## Schema placement rule

One schema per trust boundary entry. Validate once, pass typed values internally.
