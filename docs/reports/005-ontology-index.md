---
date: 2026-11-10
summary: >
  The ontology is registered by src/ontologies/index.ts (registerOntologies) and the package registers no prefix; an app's prefix map holds the prefixes. Major.
packages: [translation]
---

# 005 — The ontology index; no prefix registered

## PR

**What changed.** The package's ontology is registered by one generated module,
`src/ontologies/index.ts`, which calls core's `registerOntologies([...], import.meta.url)` with the
ontology's name, namespace, terms, data files and the prefix its data suggests. The package entry
imports it (and `shapes/index` does, where the package has one). `src/package.ts` exports `registerOntologies` in place of
`linkedOntology`. The package adds no prefix to core's prefix map any more: an app loads its own
map (`linked.app.json`), and the ontology's data states the prefix it suggests.

`ontologies/translation.register` is removed; `ontologies/translation` drops `dataFiles` and `loadData`. The namespace test checks the suggested prefix and that none is registered. README: "suggested prefix `translation:`".

Changeset: major (`.changeset/ontology-index.md`), released with the core major that provides
`registerOntologies`.

**Verification.**

- `linked generate-ontology --check`:

  ```
  translation: registered by the index, vann data checked)
  Every ontology module is current.
  ```

- `linked build`: `✔ Build successful`.
- `npm test`:

  ```
  Test Files  33 passed (33)
  ```

- No `linkedOntology`, `Prefix.add` or `.register.js` left in `src/` (grep, empty).

**Deviations.** None.

**Follow-ups.** None in this repo.

## Details

Built and tested against the core and cli of the same coordinated major, and the standard
vocabulary packages in the index layout. The same change across every linked package with an
ontology is described alike in each package's report.
