---
"@_linked/translation": minor
---

Declare every client-called `TranslationProvider` method for declared-callable dispatch: `getMessages` is `@callable('public')`, and the nineteen read and authoring methods, which already require a session and access, are `@callable('user')`, so a server answers 401 before they run when there is no session. Requires `@_linked/server-utils` `^1.9.0`.
