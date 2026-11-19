---
id: TASK-115.3
title: 'Step 1: better-result replaces core/result across the project'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T08:17:00Z'
labels:
  - architecture
dependencies:
  - TASK-114.3
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/core/result.ts` is 9 lines imported by 48 files (20 core, 17 replica, 5 platform, 3 ui, 2 builder) with 314 `.ok` checks and no tagged errors or exhaustive match. ADR-0004 part 3 chooses `better-result` 3.0.1 (3.4 KB gzip, zero dependencies, compiles on TypeScript 7.0.2) as the one `Result` in the repository. Its shape differs (`status`, `.value`, `.error`, `Result.ok`, `Result.err`), so this is one mechanical PR with no behavior change. Owner decision Q13: after TASK-114.3 is merged, so after all three block-address PRs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `src/core/result.ts` is deleted and no file imports it; `better-result` is pinned in `package.json`
- [ ] #2 `bun test` and `bun run test:browser` junit lists equal the baseline
- [ ] #3 The background page grows by at most 4 KB gzip in `bun run build`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin better-result 3.0.1 in package.json and bun.lock.
2. Replace every import of src/core/result.ts (48 files) with better-result: ok/err become Result.ok/Result.err, .ok checks become isOk()/isErr() or status, the Result type comes from better-result; delete src/core/result.ts.
3. Keep plain shapes wherever a Result crosses postMessage, storage or the wire (DESIGN: the swap is in memory only).
4. Port Result-shaped literals in tests to the new shape with no change of expected values; record any engine-*.test.ts hunk in deferred-work.md as a reconciled deviation.
5. Checks-only tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.3): junit lists equal the baseline in _bmad-output/implementation-artifacts/task-115-baseline; background page grows by at most 4 KB gzip; full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on branch task-115-3-better-result (965d26f): better-result 3.0.1 pinned, src/core/result.ts deleted, every in-memory result ported; plain shapes kept at external boundaries (the browser port-contract adapter converts before page.evaluate). Checks on the tip: oxfmt, lint, typecheck, bun test 3501 pass/1 skip with 0 baseline lines missing, browser 583 lines with 0 missing (one focus flake in tests/open.e2e.ts:253 passed 3/3 on rerun), build. Background page gzip 102292 -> 105366 bytes (+3074, limit 4096). Engine-test literal hunks recorded in deferred-work.md as a deviation.
<!-- SECTION:NOTES:END -->
