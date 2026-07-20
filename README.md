# `@_linked/translation`

Graph-native translation management for LINKED applications. It provides:

- `TranslationKey`, `TranslationUnit`, and `GlossaryTerm` shapes;
- a server provider for app-scoped keys and language messages;
- framework-light message formatting;
- React bindings compatible with Tolgee-style `useTranslate()` calls;
- a static key-sync tool that reports source drift, conflicts, and orphans.

## Install

```sh
npm install @_linked/translation
```

## Entry points

- `@_linked/translation` — shapes and message model
- `@_linked/translation/backend` — LINKED server provider registration
- `@_linked/translation/react` — provider, hooks, and `<T>`
- `@_linked/translation/key-sync` — development-time source extraction and sync

Create Now's editor, menu contribution, entitlement, and capability activation
are deliberately not part of this package. They live in Create Now's
`translation-studio` feature so applications can use this runtime without
depending on Create Now.

The package targets `@_linked/core` 2.14.4 and uses the permanent identifier
namespace `https://id.linked.cm/translation/`.
