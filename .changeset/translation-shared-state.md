---
'@_linked/translation': patch
---

A second copy of the package in one runtime now sees what the host set up on the first: the authorization resolver (`configureTranslationAuthorization`), MT providers (`registerMtProvider`), format adapters (`registerTranslationFormatAdapter`) and the `TranslationProvider` context live on `globalThis` through core's `sharedState`. Registering the same format adapter object again is no longer an error; a different adapter for a registered format still is. Requires `@_linked/core` 2.36.0 or later.
