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
