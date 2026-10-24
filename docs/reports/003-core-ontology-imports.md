---
date: 2026-10-24
summary: >
  The five translation shapes import `xsd` from the vocabulary package
  (`@_linked/xsd/ontologies/xsd`, namespace import) instead of core's internal
  `@_linked/core/ontologies/xsd`. `@_linked/xsd` ^1.4.1 added as a dependency;
  `@_linked/core` raised to ^2.41.0, which xsd needs. Patch.
---

# 003 — xsd from the vocabulary package

## Why

`@_linked/core/ontologies/xsd` is core's internal module. The `xsd` terms are published by the
vocabulary package `@_linked/xsd` as a generated accessor module.

## What changed

- `src/shapes/TranslationKeyVersion.ts`, `TranslationRelease.ts`, `TranslationInventoryOrigin.ts`,
  `TranslationRevision.ts`, `TranslationUnit.ts`: `import { xsd } from '@_linked/core/ontologies/xsd'`
  → `import * as xsd from '@_linked/xsd/ontologies/xsd'`. Every term they use exists in the
  generated module; they stay accessor references.
- `package.json`: `@_linked/xsd` ^1.4.1 in `dependencies`. It depends only on `@_linked/core`,
  so it adds no cycle. `@_linked/xsd@1.4.1` needs `@_linked/core` ^2.41.0, so the `@_linked/core`
  range goes from ^2.39.1 to ^2.41.0: with the old range a consumer on core 2.39/2.40 would get a
  second core copy nested under `@_linked/xsd`. Lockfile refreshed: the locked core moves from
  2.39.1 to 2.42.1; `npm ls` shows one copy, deduped.
- `.changeset/core-ontology-imports.md`: patch.
- A grep of `src`, tests and scripts for `@_linked/core/ontologies/(xsd|rdf|rdfs|owl)`, static
  or dynamic, finds nothing else.

## Gate

- `npm run build` (`linked build` + `check:subpaths`): "✔ Build successful", "check-subpaths:
  all 30 subpaths resolve against lib/esm.". The repo's CLI (1.56.0) has no ontology-module step;
  `npm exec --package=@_linked/cli@1.57.1 -- linked build` reports "✔ Checking ontology modules".
- `npm test`: "Test Files 33 passed (33)", "Tests 386 passed (386)", then check-subpaths as above.

## PR

### Summary

The translation shapes take their `xsd` datatypes from the `@_linked/xsd` vocabulary package
instead of core's internal ontology module.

### Changes

- `TranslationKeyVersion`, `TranslationRelease`, `TranslationInventoryOrigin`,
  `TranslationRevision`, `TranslationUnit`: `import * as xsd from '@_linked/xsd/ontologies/xsd'`.
- `@_linked/xsd` ^1.4.1 as a dependency, and `@_linked/core` ^2.39.1 → ^2.41.0 because
  `@_linked/xsd` needs it (an older core would be duplicated); lockfile refreshed (locked core
  2.39.1 → 2.42.1).
- Patch changeset.

### Verification

- `npm run build`: "✔ Build successful", "check-subpaths: all 30 subpaths resolve against
  lib/esm."; with `@_linked/cli@1.57.1`: "✔ Checking ontology modules".
- `npm test`: "Test Files 33 passed (33)", "Tests 386 passed (386)".

### Deviations

None.

### Follow-ups

None.
