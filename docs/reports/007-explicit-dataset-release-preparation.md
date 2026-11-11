---
summary: Prepare the additive dataset execution API for upstream review with a minor Changeset while retaining package and lockfile versions.
---

# Explicit dataset execution release preparation

## PR

### Summary

Add optional explicit dataset execution to shape-key list, propagation, clear and key upsert helpers. Capture the target once and retain it through nested key/version reads, writes, current pointers and stale-unit updates. Existing callers retain default dispatch. Clear may explicitly skip only its first key-copy SELECT failure; later read/write errors propagate.

### Changes

Two production files implement the additive options and necessary private query factoring. Existing canonical-node, author, override, language and count behavior remains. The target is a trusted host option, not permission or RPC authority; no Core/dependency/global routing change is introduced. A minor Changeset is included without hand-editing package/lock versions.

### Verification

Actual own Node24.22/Core2.47/TypeScript5.9.3/Vitest5.1:

```text
npm run build: PASS4.618s; all31 public subpaths resolve
npm test: PASS35files/410tests,4.684s process
```

The packed branch artifact's80 JS/declaration files match emitted output. Both public subpaths compile old/new calls and reject4invalid option controls. Real inferring Fuseki checks pass13persisted groups plus3neighbor controls; a fresh independent review passes5groups/105actual store requests. Selected A/B versions, pointers, supersedes, stale units, override/clear removal, concurrent target snapshots, narrow first-read handling and later failures are covered with a separate default sentinel. Details and exact digests: reports004–006. All owned test infrastructure was removed.

### Deviations

An initial isolated network fixture did not publish its requested loopback port; only owned resources were recreated and the failure preserved. Injected faults supplement real persisted success cases; no rollback/transaction guarantee is claimed. Local npm11.19.1 was used; declared npm12.2.0 remains a CI qualification.

### Follow-ups

Upstream review/CI and the normal release workflow remain pending. Publication of the resulting release is required before CN can adopt this seam through normal dependencies; registry0.10.0 does not contain it. The local packed candidate retains0.10.0 solely for qualification. This PR does not complete downstream scope/auth integration or authorize application/provider deployment.

## Details

`TranslationExecutionOptions` is exported from the existing public `shapes/TranslationProvider` subpath. Its optional readonly `dataset: IDataset` is a trusted in-process execution target. List accepts it second; propagation, clear and key upsert accept it third after their existing arguments. Clear's `ShapeKeyClearExecutionOptions` additionally exposes `skipInitialKeyReadFailure?: boolean`. There is no new root barrel, public unit/revision/release option or Core API.

One scalar target capture feeds key/unit reads, upsert, current-version reads/creation/backfill, stale units and snapshot removal. Omitted options retain the old thenable/default path. Clear captures exact true before awaiting, reuses its successful first key result, and catches only that SELECT execution. Omitted/false paths retain concurrent initial reads and default errors. Later key/version/unit/write errors retain current behavior, including the pre-existing version-read catch/backfill exception.

The build/public consumer/full package and real inferring-store evidence addresses limitations in the initial in-memory/transport component checks. Raw APIs remain dependent on host authorization and store selection. The isolated fixture changes its default only during serial setup or explicit default-compatibility controls, restoring the sentinel before target/concurrent assertions. Multi-copy/store rollback remains outside the contract.

Current target main was rechecked unchanged at91e805e7b88022e4113df130cc61ec0beb1a7a5e. Local/shared PR workflows were inspected: build/test/changeset checks only; the distinct publication workflow triggers on pushes to main. This preparation changes no workflow or credentials. The canonical checkout remains untouched. Plan001 is retained as the coordinator's approved phase record; reports004–006 remain historical and unmodified.
