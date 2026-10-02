---
'@_linked/translation': patch
---

`TranslationProvider.requireActor` and `requireAccess` are declared `@internal()`, so a server never dispatches them over HTTP. `advanceReleaseHotfix` accepts releases of an app whose id ends in `/`: it checks access to the app id the release is stored under, the same one `createRelease` checked. Requires `@_linked/server-utils` `^1.6.0`.
