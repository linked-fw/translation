---
"@_linked/translation": patch
---

Publish `lib/` only: the package no longer ships `src/`. An app that installs translation from npm
loads one copy of it. Before, the `@_linked/cli` Vite config took any installed linked package with
a `src/` directory for a source workspace, so Vite compiled translation from `src/` while Node loaded
`lib/`. The app logged `[linked] TWO COPIES` for translation's register modules at startup and
"watching 2 workspace packages". The Turtle file that `loadData()` reads is at `lib/esm/data/`, and
the sourcemaps inline their sources. The top-level `types` field now points at
`lib/esm/index.d.ts` (it used to name a file that does not exist).
