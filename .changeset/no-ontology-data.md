---
'@_linked/translation': minor
---

The ontology registers without data. `src/data/translation.json` held an empty graph, so it is deleted and
the ontology no longer passes a `loadData`; apps stop logging that its data "is not Turtle text;
skipped".

- **Breaking:** the `loadData` export of `ontologies/translation` is removed, and `data/translation.json` is no
  longer in `lib/esm/`.
