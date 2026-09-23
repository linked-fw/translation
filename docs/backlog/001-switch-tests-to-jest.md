---
summary: >
  This package runs its 208 tests on Vitest while 13 of the 18 packages with tests in the
  workspace run Jest. Consider aligning. Explicitly NOT a release blocker: CI is runner-agnostic
  and this package publishes fine as-is.
---

# 001 — Consider switching the test suite from Vitest to Jest

**Status:** open, low priority. Raised while extracting this package out of Create Now
(CN plan 049). Nothing depends on it.

## What exists today

- **Vitest.** `vitest.config.ts` at the repo root, `environment: 'jsdom'`,
  `setupFiles: ['./tests/setup.ts']` (which only wires `@testing-library/react`'s `cleanup` into
  `afterEach`). `"test": "vitest run"`.
- **27 test files, 208 tests**, all green.
- One file is `.tsx` (`tests/translation-react.test.tsx`) and needs the jsdom + RTL combination;
  the rest are plain `.ts`.

## Why it might be worth changing

Surveying every package in the Create Now workspace, the runner splits along the **repo
boundary**, not along a unit/integration line:

| Group | Runner |
|---|---|
| Packages that are their own git checkouts — `auth`, `core`, `cli`, `react`, `server`, `server-utils`, `s3`, `lincd`, `fuseki`, `access`, `documents`, `execution-gateway` | **Jest 29** + `ts-jest`, `jest.config.cjs` |
| Create Now root app | **Vitest** + Playwright |
| CN-owned package folders | mixed — `translation` and `maps` on Vitest, `access`/`documents`/`execution-gateway` on Jest, `primitives` on `node --test` |

**13 of the 18 packages that have tests use Jest.** This package is now its own checkout, which
puts it in the group where Jest is the norm.

## Why it is NOT urgent, and not a release blocker

**CI does not care.** The shared `pr.yml` in `linked-fw/.github` runs `npm test`
script-agnostically — its `test-script` input defaults to `test` and it simply invokes that
script. The `Build & Test` check has passed green on Vitest throughout, including on the merge
that brought this tree in. Nothing in the publish path inspects the runner.

**The convention is weaker than the count suggests.** The Jest configs are a legacy inherited
from the upstream LINCD repos, not a deliberate house choice. Create Now itself — the largest
consumer of this package — is on Vitest, as is `@_linked/maps`. So "Jest everywhere" is not
actually true of the newer code.

**There is a real cost.** The jsdom + React Testing Library setup, the ESM-native config, and the
`@testing-library/dom` peer arrangement all work today. Moving to Jest means `ts-jest` or
`babel-jest`, ESM configuration (`NODE_OPTIONS=--experimental-vm-modules`, as `access` needs), and
re-verifying 208 tests for a change with no functional outcome.

## Decision needed

Either align with the Jest majority for consistency across first-party packages, or record Vitest
as acceptable for newer packages and let the two coexist. **Do not treat this as blocking a
release.**

## Related

- `linked-fw/core` backlog 043 — language-tagged literals in the DSL. Unrelated to the runner, but
  the other open backlog item against this package.
