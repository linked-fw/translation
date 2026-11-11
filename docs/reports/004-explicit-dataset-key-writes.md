---
summary: Key upserts accept an optional explicit dataset and keep nested key versions, pointers and unit updates on that target while preserving default routing.
---

# Explicit datasets for translation key writes

The key-upsert source API accepts a third `TranslationExecutionOptions` argument containing an optional `dataset: IDataset`. It captures that target once and passes it through existing-key reads, version reads/creation/backfill, current-version pointer changes, key writes and stale-unit updates. Hosts can keep a compound key write in the physical dataset they selected.

Calls without a target retain the existing implicit shape/default routing and error behavior. Existing unit/revision/release public signatures, authorization and override rules remain unchanged. Raw package functions still rely on the host's permission checks; a dataset option is not authority and is not exposed as an RPC payload.

## Local Phase1A validation

Node24.22.0, actual Core2.47.0, TypeScript5.9.3 and Vitest5.1.0 were used with the unchanged normal lockfile and one installed Core copy.

- Focused shape-copy, version-write and explicit-dataset tests:3 files,27/27 passed,818ms runner time (1.236s process).
- Package no-emit typecheck:0 errors,1.019s. Separate semantic check of the new test root:0 errors,655ms.
- Independent checks:15 paired groups and a separate8-group branch pass, with no confirmed source finding. These cover new/current/missing versions, target-only pointers and writes, same-ID concurrent datasets, effectful option getter and mutation across awaits, default-source parity, preserved error wrapping and selected-store refusal without default fallback. The groups overlap and are not a full package test count.

The direct-dataset tests use actual Core datasets. Valid units are seeded through the existing public unit writer in serial isolated setup; the default sentinel is restored before target operations and concurrent assertions. No new unit-writer target API, casts or model changes were introduced for fixtures. The validation summary and exact source hashes are in [004-explicit-dataset-key-writes.json](004-explicit-dataset-key-writes.json).

## Remaining qualification

Core's in-memory dataset rejects bulk `where` updates. These checks prove the stale-unit query reaches the selected dataset and its refusal does not fall back; they do not prove successful persisted staling or atomic rollback. The planned inferring-store gate must prove the actual effect.

Shape-key list/propagate/clear execution options and clear's opt-in first-key-read handling are Phase1B. New emitted JS/declarations/public-subpath consumer checks, full package tests/build, real-store qualification and release approval remain pending. This local checkpoint is not a published API release or completion of the host integration. No package, lockfile or dependency range changed.
