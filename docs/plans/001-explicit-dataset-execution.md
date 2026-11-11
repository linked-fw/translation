---
summary: Add explicit dataset execution to shape-key operations and key version writes without changing default dispatch, authorization or failure behavior.
status: Implementation
---

# Explicit dataset execution for CN shape-key delegation

## Approved boundary and current authorization

The coordinator approved this bounded prerequisite on 2026-11-11, following the verified public0.10 execution proposal. This commit contains the plan/tasks only. **No source implementation, dependency installation, build, service startup, PR, push or publication is authorized by this plan commit.** The coordinator must give the next source GO and coordinate one Cursor/Grok source worker. No parallel source workers or Core changes.

Baseline: actual origin/main `91e805e7b88022e4113df130cc61ec0beb1a7a5e`, version0.10.0. The canonical LIGHT checkout is deliberately unchanged at `ad090db0549b70551250c31bd61d0b3494fd0d75`/main (0.8.0); implementation uses only this isolated Love checkout. No applicable ancestor/repository AGENTS.md or docs/architecture files were found. Follow repository README, Changesets policy, existing public query/subpath contracts and the coordinator's approved constraints. No active plans existed; this is plan001. Existing reports001–003 remain historical; reserve the next available report only at review, not now.

CN currently visits every distinct default-slot physical store once within each ordered scope project, under existing scope-admin/main checks; shared stores can be visited again for another project. Its direct `.exec(store)` coverage cannot be reproduced by picking an app. `onBranch` requires a real app and imposes app-connection rights/graph routes. Scope delegation must therefore pass its existing trusted store to supported package operations. Per-app clear keeps its existing authorized active-branch `onBranch` context and may omit the dataset. Optional CN overview/detail read conversion is deferred. This package does not implement or change CN authorization, routing, scope traversal or actor lookup.

## Current coordinator authorization — 2026-11-11

The root coordinator has now authorized this package's isolated source preparation/implementation through pinned Cursor CLI Grok4.7Low only (`grok-4.7-low`, sandbox enabled, auto-update disabled, actual HOME/Node24). One source worker at a time in this repo; max two concurrent source workers across different repos is explicitly allowed. This supersedes the initial plan-only hold, not the independent review/publication gates. Coordinator agents do not hand-edit product code. No source commit/Changeset/PR/push/publish is authorized yet; only plan documentation commits precede workers.

**Phase1A source GO:** ONLY `src/shapes/TranslationProvider.ts` plus focused typed tests (`tests/translation-version-writes.test.ts` and optional new `tests/translation-execution-dataset.test.ts`). Export TranslationExecutionOptions, add third upsert option and snapshot dataset once; thread it through private key-version read/create/ensure and all key/currentVersion/stale-unit queries. Existing no-option callers/default errors/dispatch must stay unchanged; do not add an implicit current dataset override, skip policy, unit/revision/release public options, auth change or another production file. Only this first subphase is source-authorized now. Worker performs no tests/shell/network/services/commits; coordinator freezes exact output, runs own focused unit/type checks, and obtains fresh independent review before accepting.

**Phase1B depends on accepted1A:** later separate worker changes `src/shape-key-copies.ts` plus focused tests using the established API; target/skip snapshots and clear-only first-read catch remain exactly as approved. It is not parallel in this package. Root has now authorized this dependent slice after local Phase1A acceptance.

Source jobs are bounded at300s, use a separate chat for this repo, exact project Read/Write permission scope and normal interactive workspace trust if required; no force/yolo/trust flag, auto-MCP approval or global/private profile edits. Preserve all failed/partial attempts. Normal same-task CLI resume may retain context; model/spend remains the user-selected pinned Grok Low. Any output is an intermediate candidate until frozen and independently reviewed. No public API qualification claim until actual new emitted JS+d.ts are built/checked.

Baseline install qualification is complete: normal own npm ci53.188s/457 packages; Node24.22/npm11.19.1 (manifest packageManager12.2, not claimed qualified), actual one Core2.47 physical/loaded copy; locked graph intact. Existing two focused files21/21 pass, native modules and published0.10 API/consumer checks pass. Source, manifest and lock unchanged; own real node_modules/private cache only. Details remain in coordinator evidence, not copied private logs in the repo. Real inferring-store/new output/build/fullsuite remain pending.

### Phase1A locally accepted; Phase1B authorized

Cursor/Grok-only output is frozen as Provider `2ff6feaea08f8ea9249c3c618b37598eb6207781ab716eacedd340e42d791ed1` plus six typed tests `7c3dbf2727d349661eacf635b0d47f967a2c83c2aa6a4ccfc963255ba2cf155d`; candidate manifest `8e5ba3a10cf9dee6b46b15272a8a4da0bcb9b4368a7f2b58f70923d07f106b98`. Existing test files, other production source, package and lock remain unchanged. Coordinator made no direct product edits.

Actual own Node24.22/Core2.47/Vitest5.1 gates: focused3files27/27 pass (818ms runner/1.236s process), package no-emit typecheck0errors1.019s, narrow newtest semantic types0errors655ms. Independent separate-context Provider review has15 fresh paired groupsPASS0.660s,0fetch attempts and no P1/P2/P3 production finding (reportSHA `acfbb774b64769d7fe7784db5e9edd3111749dfa31318330df9d71b7d4ccd1d0`). Original default behavior/error wrapping, option getter/snapshot mutation, target isolation, nested version/backfill/pointer and refusal/no-fallback paths were checked against original source.

The actual InMemoryDataset refuses bulk where UPDATE. Tests assert that genuine selected-target refusal and absence of global fallback; successful persisted stale-unit effect remains the required real inferring-store gate. Unit fixtures now use the existing public upsertTranslationUnit in serial isolated setup, restoring sentinel in finally before target/concurrent assertions; no model/type/cast/unit-writer API expansion. Earlier read-only timeout, fixture/type failures and approval-stop outputs stay preserved. Fresh explicit user permission now covers relevant private source/tests/context to Cursor/Grok while excluding secrets, credentials, env files and real user data. All current external workers have exited and only the matching temporary project policy was removed.

Root accepted Phase1A locally within these limits and authorized its phase commit. See report004. Phase1B source was subsequently completed and locally accepted as recorded below. No new emitted JS/d.ts/public artifact, full suite, real-store successful staling, release, Changeset, source commit, PR/push/publication or completed CN handoff is claimed by these quick gates.

### Phase1B locally accepted; Phase2 qualification authorized

Shape-copy operations now snapshot the optional dataset once and retain it through key/unit reads, nested upserts and snapshot removal. Clear captures its explicit true-only first-read policy before awaiting; only the initial key SELECT execution is caught, its successful rows are reused, and all later errors stay outside the catch. Default dispatch/Promise.all/errors, canonical validation, override/count/language behavior and author forwarding are preserved. Provider remains the accepted Phase1A bytes.

Actual own Node24.22/Core2.47 gates:35/35 focused tests (800ms runner/1.143s process), narrow test semantic types0errors729ms; unchanged production source package no-emit0errors0.983s. Separate-context review ran8 fresh paired groups using actual Core builders and explicitly scripted transport, with no confirmed P1/P2. Root accepted the bounded component; report005 records exact source/test hashes and limits. These are not successful RDF/inference/staling claims.

Root authorized the local Phase1B commit and planned Phase2: own build/emitted public JS+d.ts consumer qualification, full package suite and real inferring-store controls. Audit lifecycle/test endpoints first. Use only owned labelled infrastructure/unique datasets and a free nonoverlapping port/subnet; no shared/owner3030 or PG42421/49422/63059. Product integration tests remain scoped source-worker edits; source Phase1 remains frozen absent a concrete finding. Fresh independent Phase2 review and separate release approval remain required; no Changeset, push, PR or publication is authorized.

## Exact additive public contracts

Define/export the execution type beside TranslationKeyWriteContext in the already public shapes/TranslationProvider subpath; shape-key-copies imports/re-exports the type as needed without moving code to an isomorphic root barrel.

```ts
import type { IDataset } from '@_linked/core/interfaces/IDataset';

export interface TranslationExecutionOptions {
  readonly dataset?: IDataset;
}
export interface ShapeKeyClearExecutionOptions extends TranslationExecutionOptions {
  readonly skipInitialKeyReadFailure?: boolean;
}

listShapeKeyCopies(query?: ShapeKeyQuery,
  execution?: TranslationExecutionOptions): Promise<ShapeKeyCopyRecord[]>;
propagateShapeKeySource(data: {shapeIri:string; key:string; sourceText:string},
  authorship?: Pick<TranslationKeyWriteContext, 'createdBy'>,
  execution?: TranslationExecutionOptions): Promise<ShapeKeyPropagation>;
clearShapeKeyOverride(data: {shapeIri:string; key:string; appId?:string},
  authorship?: Pick<TranslationKeyWriteContext, 'createdBy'>,
  execution?: ShapeKeyClearExecutionOptions): Promise<{clearedApps:string[]}>;
upsertTranslationKey(data: TranslationKeyInput,
  authorship?: TranslationKeyWriteContext,
  execution?: TranslationExecutionOptions): Promise<TranslationKeyWriteResult>;
```

These are trusted in-process options, never client JSON/RPC authority. Capture dataset identity once at public entry; clear also captures the opt-in once before its first await. Passing options through nested operations must use the captured target, not reread a caller-mutable options object. The dataset object's own lifetime remains its owner's responsibility; do not freeze/clone a live dataset.

Omitted/undefined dataset retains current shape/global dispatch. Omitted/false skip flag retains current error behavior, including original thrown values and existing list/Promise.all flow. No new defaults, permissions, quotas, system identity, global dataset/shape/dispatch mutation, ambient dataset scope, transaction framework or Core API. Existing pure hash/contract/version-ID helpers stay pure. Existing helper error handling (including readKeyVersion catch-to-null) stays unchanged; the new clear catch must not absorb later failures.

## Required target threading — no implicit nested execution escapes

Use Core's existing `.exec(dataset)`; `.one()` is a builder, so `.one().exec(dataset)` is valid. Execute each original query exactly once. An explicit target must never fall back to default after rejection.

| Function | All affected paths |
| --- | --- |
| listShapeKeyCopies | Copy-key SELECT and unit/language SELECT on the captured target. |
| propagateShapeKeySource | Forward captured target to list and every upsert; preserve declaration-sync/override rules and returned counts. |
| clearShapeKeyOverride | Forward target to list/opt-in copy loader, each upsert and direct shapeSource-removal UPDATE. |
| upsertTranslationKey | Existing-key SELECT, ensureCurrentKeyVersion, changed/first version creation, key CREATE/UPDATE, stale-unit UPDATE and currentVersion UPDATE. |
| ensureCurrentKeyVersion | Forward target to readKeyVersion, backfill createTranslationKeyVersion and currentVersion UPDATE. |
| readKeyVersion | Version SELECT on the target, with existing catch behavior unchanged. |
| createTranslationKeyVersion | Version CREATE on the same target; derivation/hash/ID code unchanged. |

Only two production files: `src/shape-key-copies.ts` and `src/shapes/TranslationProvider.ts`. Existing callers of private version helpers outside this bounded key path omit target and retain current dispatch. Do not widen public unit/revision/release APIs. Keep canonical key-node checks, version/supersedes/source contracts, author identity, metadata, override behavior, language sorting and no-app/plain-UI exclusions.

## Clear-only initial-read option

The existing CN clear skips a failed first key-copy read but does not hide subsequent writes. Package clear currently bundles initial reads and writes; catching the whole operation or list would swallow too much.

When and only when captured skipInitialKeyReadFailure is true, isolate its FIRST TranslationKey copy SELECT in a narrow try/catch. Failure returns `{clearedApps:[]}` with no unit/version/key/write query afterward. A successful first key read is reused (no duplicate preflight); unit/language reads and all later upsert/version/key/stale/snapshot operations are outside the catch. Their current errors propagate. A later upsert's existing-key SELECT is not the first copy SELECT. Factor only private copy-query/mapping code needed to support the option. Do not add generic phase/error/commit machinery or make the default path sequential to identify errors.

## Ordered implementation tasks — staged coordinator GO

### Phase1 — bounded source implementation and paired unit tests

Progress: Phase1A and Phase1B locally accepted (reports004–005); source phases complete within direct-dataset/transport test limits. Phase2 build/public consumers/full suite/real inferring-store qualification is now coordinator-authorized and pending.

Worker reads full two production files plus immediate query/version helpers and existing shape-copy/version-write tests. Implement the exact public contracts and threading above; no package/lock/Core/auth edits. Update existing mocks to model legitimate builders with exec where required, not production fixture carveouts. Keep public output/argument compatibility; consumers with no options compile unchanged.

Focused test files: `tests/translation-shape-key-copies.test.ts`, `tests/translation-version-writes.test.ts`, and at most one new `tests/translation-execution-dataset.test.ts` if real Core query-to-dataset tests do not fit those files. Preserve existing suites and do not mark failures skipped/retried.

Concrete acceptance cases:

- `default-unchanged`: omitted options, empty options and skip false preserve outputs, current dispatch, original read/write error identity and existing override/count behavior.
- `explicit-target-all-paths`: targetA receives every copy/unit/key/version/currentVersion/stale/snapshot query; a different default sentinel receives zero. Include existing version, missing-version backfill, new key and changed-version branches. No fallback on selected-store refusal.
- `concurrent-isolation`: interleave targetA/targetB operations using identical node IRIs, including an await inside version hashing; no target crossing or global default change. Mutate caller execution.dataset after the first await and assert all queries stay on the originally captured target.
- `first-key-failure-opt-in`: explicit true + first copy SELECT rejection returns empty; no later unit/read/write call. Omission/false rejects the SAME error. Assert the key SELECT occurs once on success.
- `later-errors-not-swallowed`: with successful first key lookup and opt-in, separately reject unit/language SELECT, later existing-key SELECT, version creation, key UPDATE, stale UPDATE and snapshot removal; assert the original failure rejects. Preserve readKeyVersion's pre-existing catch-to-null/backfill behavior instead of inventing a new error policy. Mutate skip flag across await and assert the captured policy remains.
- `semantic-controls`: changed source creates version/supersedes and stales only its own units; unchanged text with an existing valid version creates/stales none; missing version backfills in target; propagation leaves overrides; clear resets false/removes snapshot; no-text copies are not counted; malformed sole copy node refuses without writes. Do not promise multi-copy/store rollback.

Quick gate after phase1 (future owned install only): `npm exec -- vitest run tests/translation-shape-key-copies.test.ts tests/translation-version-writes.test.ts tests/translation-execution-dataset.test.ts` (omit new path if unused) and `npm exec -- tsc -p tsconfig-esm.json --noEmit`. Target1–2 minutes; capture actual duration/failures, do not change timeouts or suppress tests to meet the target.

### Phase2 — independent review, real store and public consumers

Depends on phase1 and a frozen exact candidate. Use a separately owned consumer fixture/normal dependencies for actual inferring Fuseki `ghcr.io/linked-fw/fuseki:6.2.0-2`, own sanitized data/config/ports, no owner/shared store. This repo does not declare Fuseki: do not add an undeclared integration import to its default tests or a machine-path dependency. Coordinator must qualify and document the owned real-store harness before running it; no services are authorized by this plan commit.

Real store cases: two explicit datasets plus a separate default sentinel, same app/key/version IRIs in each, legitimate distinct app/key nodes within each store; seed through real public package upsert APIs. Verify persisted key/version/currentVersion/supersedes/stale/snapshot bytes stay in target and concurrent calls stay isolated. Pair denied/faulted targets with valid targets. Keep CN multi-project/shared-store count, scope-admin/main and per-app branch/channel/auth acceptance in the later CN integration task; package store selection is not proof of authorization.

Public consumer/declaration checks: use `@_linked/translation/shape-key-copies` and `@_linked/translation/shapes/TranslationProvider` and the actual built JS+d.ts; no src/deep implementation imports or ambient shims. Old calls and new dataset options compile; primitive/string dataset, skip flag on unrelated operations and malformed option types fail TypeScript. Run `npm run build`, `npm test` (full review gate), and `npm run check:subpaths`; record exact commands, counts and timings once dependencies are qualified. Build/subpath gates are necessary because package ships lib only. Do not treat mock unit successes as real-store/consumer qualification.

### Phase3 — reviewed release preparation, no implicit publication

After independent review and all applicable gates, add one Changesets **minor** entry for the additive public API (consistent with0.10's additive feature release), retaining0.10.0 package/lock until the normal Release PR versions it. Expected next minor is0.11.0 if no intervening release; do not assert or hand-edit that future version. Changesets README/config use main and automatic Release PR/publish workflow. Docs-only planning needs no changeset. Root separately authorizes any upstream PR, push, merge or publication after concrete reviewable work; none is authorized now. Publication/consumer qualification remains a prerequisite for faithful CN delegation;0.10 alone does not finish CN handoff.

## Readiness at this plan commit

No node_modules or build output is present in this new checkout; no installs/tests/typechecks/builds/services run. Lockfilev3 pins Core2.47.0 (one locked path, not npm-ls proof), server-utils1.17.0, xsd1.4.4, CLI1.61.0, TypeScript5.9.3, Vitest5.1.0, jsdom30.1.3, React19.3.1. Manifest keeps Core^2.41.0; no dependency bump/localization is part of this source unit. Explicit Node24.22.0 is available. The earlier CN fixture's Core2.48/Vitest4 install is not this exact lock qualification. Root coordinates an owned normal install and lifecycle/publication precautions before any install or service. No owner .env/.npmrc/auth/ignored runtime data was copied.

Package scripts: test=`vitest run && npm run check:subpaths`, build=`npm exec linked build && npm run check:subpaths`; vitest defaults jsdom with tests/setup.ts. PR workflow reuses linked-fw checks with require-tests true, run-e2e false. Tests default to spies today; added direct-dataset and real-store controls must prove the new boundary rather than mirror its implementation. Full suite/build/real-store gates wait until review, then repeat only for relevant changes or failures. All source/test/helper hashes must be frozen and verified before/after independent probes.
