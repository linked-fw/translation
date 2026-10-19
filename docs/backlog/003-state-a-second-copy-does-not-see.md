---
summary: >
  Three registries the host configures (authorization resolver, MT providers, format adapters)
  and the unshared `TranslationContext` exist once per copy of the package, so a second copy
  denies authoring, finds no MT provider or adapter, and renders without its provider. Move them
  to core's `sharedState`.
packages: [translation]
---

# 003 — Translation state a second copy does not see

A module can be evaluated twice in one runtime (Vite's SSR runner and Node under `linked start`, or two browser bundles). The convention ([shared state and error brands](https://github.com/linked-fw/cli/blob/main/docs/architecture/shared-state-and-error-brands.md)) keeps caller-set module state on `globalThis` with `sharedState(pkg, name, init)` from `@_linked/core` 2.36.0, React contexts in that shared state, and brands error classes with `brandLinkedError` so consumers match them with `isLinkedError`. Each fix needs a test that loads a second copy of the module (`jest.isolateModulesAsync`, or a `?copy` query on the built file) and shows the state is shared.

Found by the survey for linked-fw/cli backlog 017. Paths under `src/`.

## Must be shared

| File | State | What breaks with two copies |
|---|---|---|
| `authorization.ts:19` | `let resolver` (`configureTranslationAuthorization`) | The host configures one copy; `canAuthorTranslation` on the other denies every author (fails closed). |
| `mt.ts:75` | `providers` Map (`registerMtProvider`) | `TranslationProvider` on the other copy finds no MT provider. |
| `exchange.ts:134` | `adapters` Map (`registerTranslationFormatAdapter`) | Import/export on the other copy finds no adapter. A shared registry must keep the duplicate-register check meaningful: re-registering the same adapter object is not a duplicate. |

## React context

`react.tsx:103` `TranslationContext` is created at module level: a provider from one copy is
invisible to consumers in the other, which get the null default. Create it inside `sharedState`.

## Safe per copy (leave)

`core/messages.ts:73` ICU cache, `key-version.ts:46,48` ULID state (uniqueness still holds;
only same-millisecond ordering across copies is lost), `EMPTY_MESSAGES`.
