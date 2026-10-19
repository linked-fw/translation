---
"@_linked/translation": patch
---

Provider methods that need a session are declared `@callable('signed-in')` instead of the deprecated alias `'user'`. No behaviour change. Requires `@_linked/server-utils` ^1.14.0.
