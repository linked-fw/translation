---
'@_linked/translation': minor
---

**Breaking:** shape and package IRIs move to the public first-party rule (Create Now arch-02).
The package no longer passes a `baseUri`, so `@_linked/core`'s default root applies:

- shapes: `https://id.linked.cm/translation/shape/translation/{ShapeName}` → `https://linked.cm/shape/translation/{ShapeName}` (e.g. `https://linked.cm/shape/translation/TranslationKey`)
- package: `https://id.linked.cm/translation/pkg/translation` → `https://linked.cm/pkg/translation`

Ontology terms (`https://linked.cm/ont/translation/`) and the XLIFF exchange namespace
(`https://id.linked.cm/translation/exchange/1`) are unchanged.

No migration is shipped: stored shape descriptions and any data that references the old shape IRIs
are not rewritten. Hosts must re-sync shapes (and clear or re-materialize such data) after upgrading.
