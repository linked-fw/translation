---
'@_linked/translation': minor
---

Every `TranslationProvider` method except `getMessages` checks the host's authorization resolver.

**Behaviour change — without a resolver, every read and authoring call is denied.** `canAuthorTranslation` answers `false` when no resolver is configured with `configureTranslationAuthorization`, when the resolver throws, and when it answers anything other than `true`. A host that reads or authors translations through the provider must configure a resolver, or those calls fail. `getMessages` is not affected.

- `upsertKey`, `createRelease` and `advanceReleaseHotfix` require `manage` access to the app. `advanceReleaseHotfix` takes the app from the release id and refuses a release stored under another app.
- `listKeys`, `listEntries`, `listKeyVersions`, `listMemoryMatches`, `listMemory`, `listReleases`, `listGlossary`, `listRevisions` and `listProposals` require `read` access to the app.
- A caller without a session gets a 401 response.
- Revisions, proposals, proposal decisions, memory and pretranslation writes, and new keys record the signed-in caller as their author, reviewer or creator; an author named in the call's arguments is ignored.
