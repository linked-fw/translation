---
"@_linked/translation": patch
---

The translation shapes take their `xsd` datatypes from `@_linked/xsd/ontologies/xsd` (the vocabulary package, now a dependency) instead of core's internal `@_linked/core/ontologies/xsd` module. `@_linked/core` range raised to ^2.41.0, which `@_linked/xsd` needs.
