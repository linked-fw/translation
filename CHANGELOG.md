# @\_linked/translation

## 0.2.5

### Patch Changes

- [#16](https://github.com/linked-fw/translation/pull/16) [`399d6fe`](https://github.com/linked-fw/translation/commit/399d6fe7f943ce8a221780545680bdc5de10b182) Thanks [@flyon](https://github.com/flyon)! - The ontology no longer registers by importing itself.

  It carried `import * as _this from './<prefix>.js'` and passed that namespace to
  `linkedOntology()`. Under `tsc` the self-reference survives; under a bundler it does
  not — Rollup treats it as a circular import and elides it, so the binding is
  `undefined` and a consuming app dies at boot with `_this is not defined`.

  Registration now lives in a `<prefix>.register.ts` sibling, imported from the package
  entry. Nothing changes for consumers: importing this package still registers the
  ontology.

## 0.2.4

### Patch Changes

- [#14](https://github.com/linked-fw/translation/pull/14) [`9894d86`](https://github.com/linked-fw/translation/commit/9894d861c281f2926d286503f7a0a52891d1c2d8) Thanks [@flyon](https://github.com/flyon)! - Run `check-subpaths.mjs` from `build` and `prepublishOnly`. It was added in 0.2.1 as the gate
  that stops a subpath being advertised with no compiled output behind it — the defect that shipped
  nine broken subpaths in `shape-ui`, and that left `./key-sync/node` unimportable here — but
  nothing invoked it. It only ran if someone typed it, so the bug class it exists to prevent could
  ship again silently. `prepublishOnly` calls the CLI directly rather than `npm run build`, so it
  needed the gate wiring separately or a publish would bypass it.

## 0.2.3

### Patch Changes

- [#12](https://github.com/linked-fw/translation/pull/12) [`78d903b`](https://github.com/linked-fw/translation/commit/78d903b75a701a7b89d875cb4c1409036d39756b) Thanks [@flyon](https://github.com/flyon)! - Export `./package.json`, so tooling that reads a dependency's manifest (bundlers, version checks,
  `require.resolve`) does not fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

  Document the two optional peer dependencies and what each one gates: `typescript` for the
  `key-sync` entry points, which parse source with the compiler, and `react` for `/react`. Without
  `typescript` installed, importing `key-sync` fails at runtime naming the missing peer rather than
  the subpath, which reads like a broken export.

## 0.2.2

### Patch Changes

- [#9](https://github.com/linked-fw/translation/pull/9) [`1ef9ac0`](https://github.com/linked-fw/translation/commit/1ef9ac0097174844fd33cba3d4b67206bc851d8b) Thanks [@flyon](https://github.com/flyon)! - Fix the root type entry under Node10 module resolution. `types` was `./lib/esm/index.d.ts`, which
  `typesVersions` then re-matched against its `*` pattern and rewrote to `lib/esm/lib/esm/index.d.ts`
  — a path that does not exist. Subpath imports resolved (they have no prefix to double), so only
  the bare `@_linked/translation` import failed, with `TS2307: Cannot find module`. Create Now
  resolves with `moduleResolution: node`, so every root import of this package was unresolvable
  there. Now `index.d.ts`, matching `@_linked/core`, which `typesVersions` maps correctly.

## 0.2.1

### Patch Changes

- [#7](https://github.com/linked-fw/translation/pull/7) [`d602e3e`](https://github.com/linked-fw/translation/commit/d602e3e4767488c3f01cde32106dc5d107682c2f) Thanks [@flyon](https://github.com/flyon)! - Compile the whole `src` folder rather than the entry graph, so every subpath the exports map
  advertises has emitted output behind it. The entry-graph tsconfig left `./key-sync/node` with no
  `.js` or `.d.ts` in `lib/`, so importing `@_linked/translation/key-sync/node` from a registry
  install would have failed even though the subpath was declared. Adds
  `scripts/check-subpaths.mjs`, which resolves every declared and consumer-used subpath through the
  exports map and fails the build if any has no compiled output.

  Point the changesets changelog at `linked-fw/translation`; it referenced a `linked-cm` repo that
  does not exist, so changelog links were dead.

## 0.2.0

### Minor Changes

- [#2](https://github.com/linked-fw/translation/pull/2) [`baa06e1`](https://github.com/linked-fw/translation/commit/baa06e10c4696dce1a3bcf3db4c08ccd0ed0b100) Thanks [@carlenmy](https://github.com/carlenmy)! - Release Translation Studio's portable runtime and authoring contracts: CDN and versioned release loaders, React provider/hooks, source/package/LINKED discovery, JSON/XLIFF/CSV exchange, archives, review and release support. Add bounded Tolgee JSON ZIP parsing, with English source text and explicit manager approval before import. Rename TranslationKey.upsert to upsertKey to preserve the inherited Shape.upsert API in core 2.18.1. Include the source files referenced by development exports.

  Correct Date writes and serialized timestamp reads for core 2.18.1. Add first-class language resources, configurable fallback chains, script-aware direction, and a public language-catalog loader so React clients can adopt new languages through configuration.

  Add source-scoped required glossary translations, so Oneness can require Solidaridad while Unity keeps Unidad. Required terminology failures reject machine drafts and block publication; existing preferred terms remain advisory. Match Chinese and Japanese glossary terms within unspaced sentences.

  Use locale-aware target casing for glossary checks, so Turkish DAYANIŞMA and BİRLİK match their required labels while remaining distinct concepts.

  Give full-fidelity backups a separate bounded size profile for all-language units and revision history. Keep CAT import limits, compression-ratio protection, path validation, and archive integrity checks intact.

<!--
0.1.1 and 0.1.0 are deliberately absent. Both were version bumps made in this repo before the
package had ever been published; the 0.1.1 release run failed with a 404 on PUT, because the
org npm token is scoped stage-only and cannot create a new name. Neither version exists on the
registry and neither can be installed, so listing them would have opened this package's public
history with two entries nobody can resolve. The work they described — adopting the shared
release pipeline — is part of the first published release.
-->
