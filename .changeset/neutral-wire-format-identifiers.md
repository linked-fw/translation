---
'@_linked/translation': minor
---

Exchange formats now carry neutral, framework-level identifiers instead of Create Now's name.

The package is portable; its public wire formats should not be branded with one host
product. What writers emit changes as follows:

| Where | Was | Is |
| --- | --- | --- |
| XLIFF 1.2 / 2.0 metadata namespace | `xmlns:cn="https://create-now.app/ns/translation-exchange/1"` | `xmlns:lt="https://id.linked.cm/translation/exchange/1"` |
| XLIFF metadata attributes | `cn:key`, `cn:state`, … | `lt:key`, `lt:state`, … |
| XLIFF `<note>` roles | `create-now-description`, `create-now-target` | `linked-description`, `linked-target` |
| XLIFF 1.2 `<file original>` | `create-now` | `linked` |
| CSV column | `createNowEscaping` | `escaping` |
| Archive format id | `create-now-translation-archive` | `linked-translation-archive` |
| Archive manifest path | `create-now.translation-archive.json` | `linked.translation-archive.json` |
| Archive default filename | `create-now-translations.backup.zip` | `linked-translations.backup.zip` |
| JSON ZIP format id | `create-now-i18next-zip` | `linked-i18next-zip` |
| JSON ZIP sidecar path | `create-now.exchange.json` | `linked.exchange.json` |

The new namespace is a sibling of the translation vocabulary
(`https://id.linked.cm/translation/vocab#`), so the package's identifiers now all sit under
one host.

**Every file written by an earlier version still imports.** Readers accept both spellings;
only writers changed. XLIFF metadata is read `lt:` first, then `cn:`, then unprefixed; the
`<note>` roles, the CSV column, the archive format id and manifest path, and the JSON ZIP
format id and sidecar path each accept the old value alongside the new. The archive's
`format` is part of its content-hash input, so a legacy manifest is echoed back with the id
it was hashed with rather than normalized — its hash still verifies. A round trip in both
directions is covered by `tests/translation-wire-format-identifiers.test.ts`.

Breaking only for a consumer that pinned on the *emitted* spelling — a CAT-tool profile
keyed on `cn:` attributes, a spreadsheet template expecting a `createNowEscaping` header, or
TypeScript narrowing on `CsvColumn` / `TranslationArchiveManifest['format']` /
`TRANSLATION_ARCHIVE_MANIFEST_PATH`. Nothing that merely reads files written by this package
is affected.
