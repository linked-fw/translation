---
'@_linked/translation': patch
---

Update `intl-messageformat` to 12.1.2. The 12.0 major only adds opt-in typed message values; the runtime formatter is unchanged, and the bundled ICU parser picks up 3.5.20 (locale-aware hour-cycle resolution for `j` skeletons). ICU output for plurals, select, number/date formats and literal tags is now covered by tests across the production locales.
