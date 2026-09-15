---
"@_linked/translation": minor
---

Release Translation Studio's portable runtime and authoring contracts: CDN and versioned release loaders, React provider/hooks, source/package/LINKED discovery, JSON/XLIFF/CSV exchange, archives, review and release support. Add bounded Tolgee JSON ZIP parsing, with English source text and explicit manager approval before import. Rename TranslationKey.upsert to upsertKey to preserve the inherited Shape.upsert API in core 2.18.1. Include the source files referenced by development exports.

Correct Date writes and serialized timestamp reads for core 2.18.1. Add first-class language resources, configurable fallback chains, script-aware direction, and a public language-catalog loader so React clients can adopt new languages through configuration.

Add source-scoped required glossary translations, so Oneness can require Solidaridad while Unity keeps Unidad. Required terminology failures reject machine drafts and block publication; existing preferred terms remain advisory. Match Chinese and Japanese glossary terms within unspaced sentences.
