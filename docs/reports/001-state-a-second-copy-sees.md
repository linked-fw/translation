---
summary: >
  The authorization resolver, MT provider registry, format adapter registry and the
  `TranslationProvider` context now live on `globalThis` through core's `sharedState`, so a second
  copy of the package in one runtime sees what the host set up on the first. Closes backlog 003.
packages: [translation]
---

# 001 — Translation state a second copy sees

A module can be evaluated twice in one runtime: under `linked start` once by Vite's SSR module
runner and once by Node, or in a browser when two bundles each carry a copy. Before this change
each copy of `@_linked/translation` had its own module-level state, so a host that configured one
copy left the other denying every author, finding no MT provider or format adapter, and rendering
`useTranslate` consumers without their provider. This follows the convention in linked-fw/cli
[shared state and error brands](https://github.com/linked-fw/cli/blob/main/docs/architecture/shared-state-and-error-brands.md)
(core 2.36.0 `sharedState(pkg, name, init)` on `globalThis[Symbol.for('<pkg>:<name>')]`).

## What moved

| File | Before | Now (`sharedState('@_linked/translation', name, …)`) |
|---|---|---|
| `src/authorization.ts` | `let resolver` | `'authorization'` → `{ resolver }`; `configureTranslationAuthorization` writes `state.resolver`, `canAuthorTranslation` reads it |
| `src/mt.ts` | `providers` Map | `'mt'` → `{ providers }` |
| `src/exchange.ts` | `adapters` Map | `'exchange'` → `{ adapters }` |
| `src/react.tsx` | module-level `createContext` | `'react.contexts'` → `{ TranslationContext }` |

The public API is unchanged. Each value sits in a container object whose fields are mutated, so
every copy reads the same object. The context is shared only while both copies use one React (the
CLI dedupes React); two Reacts cannot share a context at all.

## Decisions

- **Re-registering the same format adapter object is a no-op.** With a process-wide registry, a
  second copy of the host module that registers an adapter would otherwise throw "already
  registered" at boot. A *different* adapter for a registered format still throws, so the
  duplicate check keeps its meaning. The existing contract test in
  `tests/translation-exchange-contract.test.ts` was updated to assert both.
- **MT registration keeps last-wins `set`** (unchanged behaviour); it never checked duplicates.
- **Left per copy** (as the backlog item decided): the ICU cache in `core/messages.ts`, the ULID
  state in `key-version.ts` (uniqueness holds; only same-millisecond ordering across copies is
  lost), and `EMPTY_MESSAGES`.
- **Dependency:** `@_linked/core` raised from `^2.22.8` to `^2.36.1` (the lockfile already
  resolved 2.36.1).

## Tests

`tests/translation-two-copies.test.tsx` imports each **built** module (`lib/esm/*.js`) twice, the
second time under a `?copy` query so Vite evaluates it as a separate module instance, and shows:

- a resolver configured on one copy answers `canAuthorTranslation` on the other, and clearing it
  on either clears it for both;
- an MT provider registered on one copy is returned by `getMtProvider` / `resolveMtProviders` on
  the other;
- a format adapter registered on one copy is found on the other, registering the same object again
  on the other copy does not throw, and a different adapter for the format does;
- a `TranslationProvider` from one copy feeds `useTranslate` from the other (renders the loaded
  catalog value).

The tests need `lib/` built first (CI runs `linked build` before `npm test`). Against a build of the
previous source all four fail; with this change all pass. Full suite: 33 files, 386 tests, plus
`check:subpaths` (30 subpaths).

## Follow-ups

None for this package. The package defines no error classes, so there is nothing to brand.
