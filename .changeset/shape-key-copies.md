---
'@_linked/translation': minor
---

Add `@_linked/translation/shape-key-copies`: server-side operations on one shape key across every app that holds a copy. `listShapeKeyCopies` reads the copies with their override state and languages, `propagateShapeKeySource` gives every copy that follows the shape new wording (overridden copies keep theirs), and `clearShapeKeyOverride` reverts overrides, for all apps or one, to the shape's current wording. Text changes go through `upsertTranslationKey`, so they record a key version and stale the key's units like any other source change.
