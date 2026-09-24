# `@_linked/translation`

Graph-native translation management for LINKED applications. It provides:

- `TranslationKey`, `TranslationUnit`, and `GlossaryTerm` shapes;
- a server provider for app-scoped keys and language messages;
- framework-light message formatting;
- React bindings compatible with Tolgee-style `useTranslate()` calls;
- a static key-sync tool that reports source drift, conflicts, and orphans.

## Install

```sh
npm install @_linked/translation
```

### Optional peer dependencies

Two peers are optional, and each gates a specific entry point:

| Peer | Needed for |
|---|---|
| `typescript` | `@_linked/translation/key-sync` and `/key-sync/node` |
| `react` | `@_linked/translation/react` |

The key-sync entry points parse your source with the TypeScript compiler to find `t()` and `<T>`
call sites, so they `import ts from 'typescript'` directly. Without it installed, importing either
fails at runtime with `ERR_MODULE_NOT_FOUND: Cannot find package 'typescript'` — the subpath
itself resolves, so the error names the peer rather than the subpath. Everything else in the
package works without either peer.

## Entry points

- `@_linked/translation` — shapes and message model
- `@_linked/translation/backend` — LINKED server provider registration
- `@_linked/translation/react` — provider, hooks, and `<T>`
- `@_linked/translation/key-sync` — development-time source extraction and sync
- `@_linked/translation/key-sync/node` — recursive source-tree scan + dry-run/apply orchestration
- `@_linked/translation/shape-catalog` — package-owned translations attached to stable shape/property IRIs
- `@_linked/translation/discovery` — portable declarations and deterministic inventory merging
- `@_linked/translation/linked-discovery` — serialized LINKED package catalogs
- `@_linked/translation/archive` — full-fidelity backup and pure restore planning

## Code-canonical discovery

Create Now's Host Agent can inventory a managed app without running its
packages:

- literal `t()` and `<T>` calls are extracted from `src/`;
- finite dynamic key families are declared in a root
  `translation.discovery.json`;
- a reusable package points to serialized catalog JSON with
  `"linkedTranslationCatalog": "./translation.catalog.json"` in its
  `package.json`.

The Host Agent walks installed `dependencies` and `optionalDependencies`,
parses only JSON, and never imports package JavaScript. A package catalog path
must remain inside that package. Inventory is branch-local because discovery
always runs against the exact managed branch clone and persists into that
branch's metadata dataset.

## Full-fidelity archives

The archive contract complements lossy XLIFF/CSV/JSON interchange. It stores
translation configuration, keys and versions, units, glossary/style,
revision history, provenance, content translations, and historical
release/build references in a deterministic hash-inventoried ZIP. Catalog
objects may be included for offline recovery or retained as references.

Restore planning is explicit:

- same-app recovery preserves stable IDs and blocks same-ID/different-content
  collisions;
- cross-app migration deterministically rebases only app-scoped IRIs and
  requires explicit node/field mappings for graph content;
- authors remain inert provenance, and releases always restore as retired
  history pending a normal target-side publish.

Secrets, sessions, collaborators/invites, entitlements, and identity records
are rejected at the portable archive boundary.

## Translations shipped with a shape

Reusable asset packages can include a schema-versioned shape translation
catalog. The catalog is code-canonical package content; installation copies
only missing keys and active-language units into the consuming app's graph.
Existing app-authored translations are never overwritten. Packages may export
the TypeScript object or ship the same contract as JSON for Create Now's Host
Agent to discover without executing application code.

Create Now's editor, menu contribution, entitlement, and capability activation
are deliberately not part of this package. They live in Create Now's
`translation-studio` feature so applications can use this runtime without
depending on Create Now.

The package targets `@_linked/core` 2.14.4 and uses the permanent identifier
namespace `https://id.linked.cm/translation/`.

## Open language configuration

Language codes are BCP-47 strings. `TranslationLanguage` stores app-scoped RDF
resources for the code, stable language identifier, native and English names,
text direction, parent/fallback links, and enabled/supported flags. Hosts choose
an explicit configuration store; the portable package does not assume a CN
control plane. `defineLanguage` supplies editable defaults from the platform's
Unicode locale data. Validate relationship cycles before saving.

Publish the resource list as `languages.json` alongside the catalogs. Wire
`createCdnLanguageLoader({base})` to the React provider's `loadLanguages` prop
and `createCdnLoader({base})` to `loadMessages`. The language menu can then grow
without an app release. The CDN base remains caller-owned. Complete compiled
catalogs follow the configured fallback chain before the source language;
regional variants are separate tags, with no automatic Chinese-script conversion.

Core 2.18.1 compatibility: call `TranslationKey.upsertKey` for translation
creation. The inherited generic `Shape.upsert` API is preserved. Date-valued
shape mutations use `Date`; serialized translation records keep ISO strings.
