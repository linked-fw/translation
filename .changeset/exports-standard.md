---
'@_linked/translation': patch
---

Every export now resolves to the compiled `lib/esm` output, in every environment. The exports map listed a `development` condition pointing at the shipped TypeScript source; Vite enables `development` by default, so a Vite app loaded this package from raw `src/*.ts` in dev. Compiled without this package's tsconfig, the decorated shape classes were transformed with standard (TC39) decorators instead of the legacy decorators `lib/` is built with. `src` is still published so a Linked app's dev server can serve the package from source.
