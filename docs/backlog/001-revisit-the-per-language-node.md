---
summary: >
  A translation is modelled as an explicit per-language node rather than a language-tagged
  literal. Half that decision is sound and permanent; the other half is a workaround for the
  DSL not supporting `rdf:langString`. If that gap closes, this model should be revisited.
---

# 001 — Revisit the per-language node if the DSL gains language support

**Status:** open, and deliberately not actionable yet — it depends on
[`linked-fw/core` backlog 043](https://github.com/linked-fw/core/pull/251).

## What this package does today

`TranslationUnit` is an explicit node holding one language's value for a `TranslationKey`,
rather than a language-tagged literal (`"Bonjour"@fr`, i.e. `rdf:langString`). The reason is
recorded in `src/shapes/TranslationUnit.ts`:

> Explicit per-language node (not `rdf:langString`) so it can be filtered per-language
> through the LINKED DSL AND carry management metadata — review `state` and provenance —
> that a bare literal cannot hold.

## Why this is worth revisiting

That sentence contains two separate justifications, and they do not have the same lifetime.

**The management-metadata half is permanent.** A translation in this system is not just a
string — it has review state, provenance, a key version it belongs to, an owning application.
A bare literal cannot carry any of that. No amount of language support in the DSL changes it.

**The filtering half is a workaround.** "So it can be filtered per-language through the LINKED
DSL" is true only because the DSL has no notion of a language tag: it cannot declare
`rdf:langString` on a property shape, select a language, or filter with
`LANG()`/`LANGMATCHES()`. Reifying language into a node is how you get per-language querying
back. If core closes that gap, this justification disappears.

## What the revisit would ask

Not "remove `TranslationUnit`" — more likely a split:

- Values that are **only** a string in a language, with no workflow around them, could become
  tagged literals and stop needing a node at all. Cheaper to store, and natural RDF that other
  tools understand without knowing this package's vocabulary.
- Values carrying review state and provenance keep their node, because they genuinely need one.

The interesting question is whether that split is worth the complexity of having two
representations, or whether one uniform model is better even where it is heavier. That is a
real design question and should not be pre-judged here.

## Also worth noting

Modelling language as a node means this package's data is **not interoperable as multilingual
RDF**: a generic consumer looking for `rdfs:label` in French finds nothing, because the French
label is reachable only by traversing this package's vocabulary. That is a defensible trade for
a translation-management system, but it should be a conscious one.

## Related

- `linked-fw/core` backlog 043 — language-tagged literals in the DSL. This item is its mirror.
