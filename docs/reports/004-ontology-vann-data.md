---
date: 2026-11-10
summary: >
  The ontology's data carries its suggested prefix and namespace as vann triples; package.json declares the hand-written ontology with "generated": false. Patch.
packages: [translation]
---

# 004 — Ontology vann data

## PR

**What changed.** The `owl:Ontology` node in `src/data/translation.ttl` states
`vann:preferredNamespacePrefix "translation"` and `vann:preferredNamespaceUri "https://linked.cm/ont/translation/"`,
the prefix this ontology registers today, so Turtle output does not change. `package.json` declares the ontology: `"linkedOntologies": {"translation": {"namespace": "https://linked.cm/ont/translation/", "generated": false}}`. The module stays hand-written (it exports more than the generator writes); the build checks its vann data and generates nothing. No import path
or export changed. Changeset: patch.

**Verification.**

- `linked generate-ontology --check` (exit 0):

  ```
  translation: 95 terms from src/data/translation.ttl (modules written by hand: vann data checked, nothing generated)
  Every ontology module is current.
  ```

- `linked build`: `✔ Build successful`.
- `npm test`: `Tests 386 passed (386)`.

**Deviations.** None.

**Follow-ups.** `linkedOntology` (in `@_linked/core`) still registers the name as a prefix; its removal is
recorded in core's backlog 117.

## Details

The same change across the linked vocabularies, with all their verification outputs, is in
`@_linked/core`'s report 118 (linked vocabularies: vann data and one declaration).
