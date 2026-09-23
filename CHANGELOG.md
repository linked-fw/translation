# @\_linked/translation

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

## 0.1.1

### Patch Changes

- [#3](https://github.com/linked-fw/translation/pull/3) [`81672d8`](https://github.com/linked-fw/translation/commit/81672d8299320f4ab05eb6c997ef671dbc487fb7) Thanks [@flyon](https://github.com/flyon)! - Adopt the shared release pipeline: declare npm as the package manager, point `repository.url` at the `linked-fw` org, mark `package-lock.json` as a generated file, and add the `@testing-library/dom` devDependency the test suite needs on a peer-less install.
