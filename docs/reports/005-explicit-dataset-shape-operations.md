---
summary: Shape-key list, propagation and clear operations accept an explicit dataset while retaining default execution and narrowly scoped clear errors.
---

# Explicit datasets for shape-key operations

List accepts a second execution option; propagate and clear accept a third. Each captures dataset identity once and keeps every key/unit read, nested key upsert and snapshot removal on that target. Clear separately snapshots its explicit true-only `skipInitialKeyReadFailure` option. Only failure of its first key SELECT execution returns empty `clearedApps`; successful rows are reused, and later read/write errors propagate. Omitted/false options retain original default dispatch, concurrent initial reads and errors.

Canonical key checks, authorship, override rules, language filters and result counts remain unchanged. These trusted in-process options convey execution targets, not authorization. Provider source is unchanged from the accepted key-write checkpoint.

Local validation used Node24.22.0, Core2.47.0, TypeScript5.9.3 and Vitest5.1.0 with the unchanged normal lockfile:35/35 focused tests in3 files (800ms runner/1.143s process), package no-emit0errors0.983s, and focused-test semantic types0errors729ms. Eight independent paired groups passed using actual Core builders and an explicitly scripted transport, including target/flag snapshots, exact first-read catch, later error identity, defaults and canonical/override controls. Exact hashes and evidence digests are in the adjacent JSON.

Transport tests prove routing and error boundaries, not persisted query evaluation. The actual in-memory dataset refuses nested unit queries and bulk where updates. Emitted public JS/declarations, full package tests, real inferring-store version/stale/clear/concurrency effects and independent final review remain Phase2 gates. No rollback, authority, publication or completed consumer-integration claim is made. Package/lock/dependency versions remain unchanged.
