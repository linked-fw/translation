---
"@_linked/translation": patch
---

Compile the whole `src` folder rather than the entry graph, so every subpath the exports map
advertises has emitted output behind it. The entry-graph tsconfig left `./key-sync/node` with no
`.js` or `.d.ts` in `lib/`, so importing `@_linked/translation/key-sync/node` from a registry
install would have failed even though the subpath was declared. Adds
`scripts/check-subpaths.mjs`, which resolves every declared and consumer-used subpath through the
exports map and fails the build if any has no compiled output.

Point the changesets changelog at `linked-fw/translation`; it referenced a `linked-cm` repo that
does not exist, so changelog links were dead.
