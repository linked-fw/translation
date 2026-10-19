---
summary: >
  `TranslationProvider`'s session-gated methods are declared `@callable('signed-in')` instead of
  the deprecated alias `'user'` (server-utils 1.14.0). No behaviour change. Released in 0.8.1.
packages: [translation]
---

# 002 — Callable level `'signed-in'` instead of `'user'`

`@_linked/server-utils` 1.14.0 renamed the callable access level for "any caller with a session"
from `'user'` to `'signed-in'`, keeping `'user'` as a deprecated alias. The name says what the
check is (a session exists) rather than suggesting a role. This package moved to the new name so
it does not depend on the alias.

Released in **0.8.1** (patch).

## What changed

- `src/shapes/TranslationProvider.ts` — the 19 methods that need a session now declare
  `@callable('signed-in')`; `getMessages` stays `@callable('public')`; `requireActor` and
  `requireAccess` stay `@internal()`. Per-method authorization (the resolver set with
  `configureTranslationAuthorization`) is unchanged.
- `tests/translation-provider-access.test.ts` — asserts every exposed method's level
  (`'public'` for `getMessages`, `'signed-in'` for the rest), plus the existing deny/grant cases
  for signed-in callers.
- `package.json` — `@_linked/server-utils` range `^1.9.0` to `^1.14.0`, the first version with the
  `'signed-in'` level.

## Known limits

The 401 pre-check that rejects a caller without a session before the method runs needs
`@_linked/server` 3.5.0 in the host app. An older server still reaches each method's own session
check (`requireActor`), so access is enforced either way.

## Verification

`npm run build` (all 30 subpaths resolve against `lib/esm`), `npm test`: 32 files, 382 tests passed.

## Follow-ups

None.

## PRs

- https://github.com/linked-fw/translation/pull/63
