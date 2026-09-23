---
"@_linked/translation": patch
---

Fix the root type entry under Node10 module resolution. `types` was `./lib/esm/index.d.ts`, which
`typesVersions` then re-matched against its `*` pattern and rewrote to `lib/esm/lib/esm/index.d.ts`
— a path that does not exist. Subpath imports resolved (they have no prefix to double), so only
the bare `@_linked/translation` import failed, with `TS2307: Cannot find module`. Create Now
resolves with `moduleResolution: node`, so every root import of this package was unresolvable
there. Now `index.d.ts`, matching `@_linked/core`, which `typesVersions` maps correctly.
