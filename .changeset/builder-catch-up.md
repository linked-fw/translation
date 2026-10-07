---
'@_linked/translation': minor
---

Brings in the translation work done for Create Now's builder.

**Pseudo-locales and preview conditions**

- `pseudoLocalize` and `pseudoExpand` are exported from `core/messages`. With the locale `en-XA`, `translate()` pseudo-localizes any message that has no catalog entry, so an untranslated English fallback is easy to spot. An explicit `en-XA` catalog entry is used as written.
- The React `TranslationProvider` listens for a `create-now:preview-conditions` window event. The event can set a preview language, force the text direction (`ltr` or `rtl`), and turn on an `accented` or `expanded` pseudo-locale. The preview language is used for loading, formatting, `useLanguage().language` and `<html lang>`. It is never saved as the user's language.

**Keys owned by any declared resource**

- New `translation:ofResource` term and `TranslationKey.ofResource`, for a key that belongs to an action, group, condition or port rather than to a shape or property. Entry records, `upsertKey` and the key queries carry it, and exchange export treats such a key as `semantic`.

**App overrides of declared keys are kept**

- `upsertTranslationKey` takes a second argument, `{ createdBy, source }`. With `source: 'declaration-sync'`, a refresh from code or package declarations leaves an app's override alone. It writes nothing and answers `preservedOverride: true`. The RPC `upsertKey` is always treated as an app edit.
- An app's edit to any declared key (`ofShape`, `ofProperty`, `ofResource` or `fromPackage`) now marks it overridden, not just an edit to a shape key. So does an edit that changes only the message format.
- `syncTranslationKeys` reports these keys in a new `preservedOverrides` list. They are also listed in `unchanged`. A sync target's `list()` may now return `overridden`.
- A build can now pin a release in which an app has reworded a declared key, as long as the format and the arguments are unchanged. The release ships the app's wording. Format or argument changes are still refused.

**Behaviour changes**

- Updating an existing key no longer clears fields that the update did not set. Before, a partial edit removed the key's description, owner (`ofShape`, `ofProperty`, `ofResource`, `fromPackage`), `ofNode`, `ofField` and override flag.
- An explicit `overridden: false` in an `upsertKey` call is now saved, so an app edit can clear an override.
- If `upsertTranslationKey` cannot read the existing key, the write now fails. Before, it carried on as if the key were new.
- `useTranslate()` returns the inline defaults while a component is hydrating, and the catalog once it has hydrated. This fixes the hydration mismatch that happened when the catalog loaded before a suspended route hydrated. The catalog is also applied inside `startTransition`.
