---
"@_linked/translation": patch
---

Run `check-subpaths.mjs` from `build` and `prepublishOnly`. It was added in 0.2.1 as the gate
that stops a subpath being advertised with no compiled output behind it — the defect that shipped
nine broken subpaths in `shape-ui`, and that left `./key-sync/node` unimportable here — but
nothing invoked it. It only ran if someone typed it, so the bug class it exists to prevent could
ship again silently. `prepublishOnly` calls the CLI directly rather than `npm run build`, so it
needed the gate wiring separately or a publish would bypass it.
