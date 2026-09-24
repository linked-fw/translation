---
"@_linked/translation": patch
---

Export `./package.json`, so tooling that reads a dependency's manifest (bundlers, version checks,
`require.resolve`) does not fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

Document the two optional peer dependencies and what each one gates: `typescript` for the
`key-sync` entry points, which parse source with the compiler, and `react` for `/react`. Without
`typescript` installed, importing `key-sync` fails at runtime naming the missing peer rather than
the subpath, which reads like a broken export.
