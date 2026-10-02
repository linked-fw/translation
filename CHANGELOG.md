# @\_linked/translation

## 0.6.0

### Minor Changes

- [#47](https://github.com/linked-fw/translation/pull/47) [`6b722d6`](https://github.com/linked-fw/translation/commit/6b722d6dae4c2e3efc7f233827846ee87f0db38a) Thanks [@flyon](https://github.com/flyon)! - Declare every client-called `TranslationProvider` method for declared-callable dispatch: `getMessages` is `@callable('public')`, and the nineteen read and authoring methods, which already require a session and access, are `@callable('user')`, so a server answers 401 before they run when there is no session. Requires `@_linked/server-utils` `^1.9.0`.

- [#47](https://github.com/linked-fw/translation/pull/47) [`6b722d6`](https://github.com/linked-fw/translation/commit/6b722d6dae4c2e3efc7f233827846ee87f0db38a) Thanks [@flyon](https://github.com/flyon)! - Every `TranslationProvider` method except `getMessages` checks the host's authorization resolver.
  
  **Behaviour change — without a resolver, every read and authoring call is denied.** `canAuthorTranslation` answers `false` when no resolver is configured with `configureTranslationAuthorization`, when the resolver throws, and when it answers anything other than `true`. A host that reads or authors translations through the provider must configure a resolver, or those calls fail. `getMessages` is not affected.
  
  - `upsertKey`, `createRelease` and `advanceReleaseHotfix` require `manage` access to the app. `advanceReleaseHotfix` takes the app from the release id and refuses a release stored under another app.
  - `listKeys`, `listEntries`, `listKeyVersions`, `listMemoryMatches`, `listMemory`, `listReleases`, `listGlossary`, `listRevisions` and `listProposals` require `read` access to the app.
  - A caller without a session gets a 401 response.
  - Revisions, proposals, proposal decisions, memory and pretranslation writes, and new keys record the signed-in caller as their author, reviewer or creator; an author named in the call's arguments is ignored.

### Patch Changes

- [#47](https://github.com/linked-fw/translation/pull/47) [`6b722d6`](https://github.com/linked-fw/translation/commit/6b722d6dae4c2e3efc7f233827846ee87f0db38a) Thanks [@flyon](https://github.com/flyon)! - `TranslationProvider.requireActor` and `requireAccess` are declared `@internal()`, so a server never dispatches them over HTTP. `advanceReleaseHotfix` accepts releases of an app whose id ends in `/`: it checks access to the app id the release is stored under, the same one `createRelease` checked. Requires `@_linked/server-utils` `^1.9.0`.

## 0.5.0

### Minor Changes

- [#45](https://github.com/linked-fw/translation/pull/45) [`e423091`](https://github.com/linked-fw/translation/commit/e423091e9bea1683d9721d9e8b358b68a2313fa9) Thanks [@flyon](https://github.com/flyon)! - **BREAKING:** the translation ontology moves to `https://linked.cm/ont/translation/` (was `https://id.linked.cm/translation/vocab#`), following the first-party rule `https://linked.cm/ont/{ontologySlug}/{localName}` with the package's public slug as the ontology slug. Every term IRI changes — `TranslationKey` is now `https://linked.cm/ont/translation/TranslationKey`, and so on — and the JSON-LD prefix label in `data/translation.json` is now `translation` (was `tr`). The exported `tr` object and the term export names are unchanged, so code that imports terms needs no edits.
  
  Translation data — keys, units, revisions, releases, languages — is stored typed with these terms, so anything written under the old IRIs is no longer visible to this version. It is not migrated: clear dev datasets that hold translation data. Backlog 059 had called the `id.linked.cm/translation/vocab#` IRIs permanent; the namespace rule supersedes that.
  
  Not changed: shape IRIs (still built from `baseUri` `https://id.linked.cm/translation/`) and the XLIFF exchange namespace `https://id.linked.cm/translation/exchange/1` written into exported files.

## 0.4.5

### Patch Changes

- [#36](https://github.com/linked-fw/translation/pull/36) [`62b1112`](https://github.com/linked-fw/translation/commit/62b11123fe85331c0a0fee1cca30547aff571f0a) Thanks [@renovate](https://github.com/apps/renovate)! - Update `intl-messageformat` to 12.1.2. The 12.0 major only adds opt-in typed message values; the runtime formatter is unchanged, and the bundled ICU parser picks up 3.5.20 (locale-aware hour-cycle resolution for `j` skeletons). ICU output for plurals, select, number/date formats and literal tags is now covered by tests across the production locales.

## 0.4.4

### Patch Changes

- [#41](https://github.com/linked-fw/translation/pull/41) [`a25c520`](https://github.com/linked-fw/translation/commit/a25c520b0425aa40882f805f786d42e207bc358b) Thanks [@flyon](https://github.com/flyon)! - Every export now resolves to the compiled `lib/esm` output, in every environment. The exports map listed a `development` condition pointing at the shipped TypeScript source; Vite enables `development` by default, so a Vite app loaded this package from raw `src/*.ts` in dev. Compiled without this package's tsconfig, the decorated shape classes were transformed with standard (TC39) decorators instead of the legacy decorators `lib/` is built with. `src` is still published so a Linked app's dev server can serve the package from source.

## 0.4.3

### Patch Changes

- [#38](https://github.com/linked-fw/translation/pull/38) [`91d1861`](https://github.com/linked-fw/translation/commit/91d1861e569a330470940da76734b5d651a7e454) Thanks [@flyon](https://github.com/flyon)! - Publishing no longer rebuilds the package. `prepublishOnly` ran `linked build` again with the CLI pinned in the lockfile (1.11.1), replacing the output the release workflow had just built and checked; that older CLI is also why the tarball carried a stray `lib/cjs/data/translation.json`. It now only runs the subpath check against the `lib/` it is about to publish.

## 0.4.2

### Patch Changes

- [#31](https://github.com/linked-fw/translation/pull/31) [`89c6f49`](https://github.com/linked-fw/translation/commit/89c6f49a3f958f1d55a77ce08e3376933d0d1474) Thanks [@flyon](https://github.com/flyon)! - Add `shapes/index`, a side-effect-only module that registers every shape this package defines, and have the package entry import it instead of listing shapes one by one. Hosts and consumers can now load `@_linked/translation/shapes/index` to get the package's full shape set registered without pulling in anything else, and a shape added later is picked up by the entry automatically.

## 0.4.1

### Patch Changes

- [#23](https://github.com/linked-fw/translation/pull/23) [`a21dfd3`](https://github.com/linked-fw/translation/commit/a21dfd3d39a822ec31aa57cadb09919ef8c1dbd7) Thanks [@flyon](https://github.com/flyon)! - Sourcemaps now embed their TypeScript source, so consumers no longer see 'points to missing source files' warnings.

## 0.4.0

### Minor Changes

- [#20](https://github.com/linked-fw/translation/pull/20) [`61c2fea`](https://github.com/linked-fw/translation/commit/61c2feae6778ac9e8e6a2da59e0c09b546802437) Thanks [@flyon](https://github.com/flyon)! - Require `@_linked/core@^2.22.8` (was `^2.18.1`), and pin it in the lockfile.

  The declared range was wide enough that the resolved core depended on whatever the
  consumer — or this repo's own CI, via `package-lock.json` — happened to install. Core
  decides how a shape's IRI is minted, so a stale core made this package emit legacy
  `data.lincd.org` IRIs instead of the arch-02 `linked.cm` scheme. Which IRIs a published
  package produces should not be a function of the installer's dependency tree.

  Minor rather than patch: this raises the minimum core a consumer must resolve, so it
  changes what gets installed rather than only what this package does internally.

## 0.3.0

### Minor Changes

- [#18](https://github.com/linked-fw/translation/pull/18) [`394e4eb`](https://github.com/linked-fw/translation/commit/394e4ebe025f6f69cce7cdf2d1a77c106a89af01) Thanks [@flyon](https://github.com/flyon)! - Exchange formats now carry neutral, framework-level identifiers instead of Create Now's name.

  The package is portable; its public wire formats should not be branded with one host
  product. What writers emit changes as follows:

  | Where                              | Was                                                           | Is                                                       |
  | ---------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
  | XLIFF 1.2 / 2.0 metadata namespace | `xmlns:cn="https://create-now.app/ns/translation-exchange/1"` | `xmlns:lt="https://id.linked.cm/translation/exchange/1"` |
  | XLIFF metadata attributes          | `cn:key`, `cn:state`, …                                       | `lt:key`, `lt:state`, …                                  |
  | XLIFF `<note>` roles               | `create-now-description`, `create-now-target`                 | `linked-description`, `linked-target`                    |
  | XLIFF 1.2 `<file original>`        | `create-now`                                                  | `linked`                                                 |
  | CSV column                         | `createNowEscaping`                                           | `escaping`                                               |
  | Archive format id                  | `create-now-translation-archive`                              | `linked-translation-archive`                             |
  | Archive manifest path              | `create-now.translation-archive.json`                         | `linked.translation-archive.json`                        |
  | Archive default filename           | `create-now-translations.backup.zip`                          | `linked-translations.backup.zip`                         |
  | JSON ZIP format id                 | `create-now-i18next-zip`                                      | `linked-i18next-zip`                                     |
  | JSON ZIP sidecar path              | `create-now.exchange.json`                                    | `linked.exchange.json`                                   |

  The new namespace is a sibling of the translation vocabulary
  (`https://id.linked.cm/translation/vocab#`), so the package's identifiers now all sit under
  one host.

  **Every file written by an earlier version still imports.** Readers accept both spellings;
  only writers changed. XLIFF metadata is read `lt:` first, then `cn:`, then unprefixed; the
  `<note>` roles, the CSV column, the archive format id and manifest path, and the JSON ZIP
  format id and sidecar path each accept the old value alongside the new. The archive's
  `format` is part of its content-hash input, so a legacy manifest is echoed back with the id
  it was hashed with rather than normalized — its hash still verifies. A round trip in both
  directions is covered by `tests/translation-wire-format-identifiers.test.ts`.

  Breaking only for a consumer that pinned on the _emitted_ spelling — a CAT-tool profile
  keyed on `cn:` attributes, a spreadsheet template expecting a `createNowEscaping` header, or
  TypeScript narrowing on `CsvColumn` / `TranslationArchiveManifest['format']` /
  `TRANSLATION_ARCHIVE_MANIFEST_PATH`. Nothing that merely reads files written by this package
  is affected.

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
