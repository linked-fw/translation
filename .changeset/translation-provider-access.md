---
'@_linked/translation': minor
---

Check the host's authorization resolver on every translation provider method except `getMessages`.

- `upsertKey`, `createRelease` and `advanceReleaseHotfix` now require `manage` access to the app. `advanceReleaseHotfix` takes the app from the release id and refuses a release stored under another app.
- `listKeys`, `listEntries`, `listKeyVersions`, `listMemoryMatches`, `listMemory`, `listReleases`, `listGlossary`, `listRevisions` and `listProposals` now require `read` access to the app.
- `canAuthorTranslation` denies when no resolver is configured, when the resolver throws, and when it answers anything other than `true`. Hosts that read or author translations through the provider must call `configureTranslationAuthorization`.
- A caller without a session gets a 401 response.
- Each method resolves the caller once, before its first `await`, and records that caller as the author.
