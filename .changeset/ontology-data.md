---
'@_linked/translation': minor
---

Ontology data: labels, descriptions and types for every term.

- `src/data/translation.ttl`, copied into `lib/esm/data/` by the build, is the ontology's data: the
  ontology node (`dcterms:title`, `dcterms:description`, `owl:versionInfo`) and all 95 terms of
  `ontologies/translation`, each typed (`owl:Class`, `owl:ObjectProperty` or `owl:DatatypeProperty`) with an
  English `rdfs:label` and `rdfs:comment`, in the deterministic Turtle form.
- `ontologies/translation` exports `dataFiles` and `loadData` (read through
  `@_linked/core/ontology/loadOntologyFiles`, server only), and the register module passes both, so
  the ontology sync and the shape check read the data.
- **Breaking:** `src/data/translation.json` (an empty graph) is deleted, so `data/translation.json` is no longer in
  `lib/esm/`, and `loadData()` resolves to the Turtle text (`string[]`) instead of a JSON-LD document.
