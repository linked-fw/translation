---
'@_linked/translation': minor
---

**BREAKING:** the translation ontology moves to `https://linked.cm/ont/translation/` (was `https://id.linked.cm/translation/vocab#`), following the first-party rule `https://linked.cm/ont/{ontologySlug}/{localName}` with the package's public slug as the ontology slug. Every term IRI changes — `TranslationKey` is now `https://linked.cm/ont/translation/TranslationKey`, and so on — and the JSON-LD prefix label in `data/translation.json` is now `translation` (was `tr`). The exported `tr` object and the term export names are unchanged, so code that imports terms needs no edits.

Translation data — keys, units, revisions, releases, languages — is stored typed with these terms, so anything written under the old IRIs is no longer visible to this version. It is not migrated: clear dev datasets that hold translation data. Backlog 059 had called the `id.linked.cm/translation/vocab#` IRIs permanent; the namespace rule supersedes that.

Not changed: shape IRIs (still built from `baseUri` `https://id.linked.cm/translation/`) and the XLIFF exchange namespace `https://id.linked.cm/translation/exchange/1` written into exported files.
