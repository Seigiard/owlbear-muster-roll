---
id: TASK-121.1
title: Move composers.ts to src/core/compose.ts
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T07:45:00Z'
updated_date: '2026-11-19T08:19:00Z'
labels: []
dependencies: []
parent_task_id: TASK-121
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
First PR of the composer epic (see the parent). `src/replica/composers.ts` and `src/replica/composers.test.ts` move to `src/core/compose.ts` and `src/core/compose.test.ts` with no change to exports, behaviour or tests, and `src/replica/version-minter.ts` with its test moves to `src/core/version-minter.ts` the same way (it imports only `@/core/merge`; the preview needs it in TASK-121.2 without a replica import); `engine.ts`, `command-routing.ts`, `pending-edits.ts`, `room-protocol.ts` and any other importer switch to `@/core/compose`; no re-export shim stays in `src/replica`. The `.oxlintrc.json` override for `src/builder/**` keeps forbidding `@/replica/**` and `@/platform/**`. This PR changes no behaviour, so the engine suite junit list equals the baseline and it can merge while TASK-115 steps are in flight (their conflicts are import lines only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `src/core/compose.ts` exports exactly what `src/replica/composers.ts` exported; `git log --follow` shows the move; `src/replica/composers.ts` is gone and nothing in `src` imports `@/replica/composers`
- [x] #2 `src/core/compose.ts` imports only `@/core/**`; `bun run lint` passes with the `src/core/**` no-restricted-imports override
- [x] #3 Full check passes and the `bun test` junit list equals the master baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Spec: _bmad-output/implementation-artifacts/spec-task-121-1-compose-to-core.md (ready-for-dev)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Run started 2026-11-19 by Claude Code via implement-spec + tdd (OpenCode children). Junit baseline at 247bc0f: 3502 tests (3501 pass, 1 skip) across 132 files. core-*.js before: 190342 B raw, 57053 B gzip -9.

Validation at c7ab3ac: oxfmt clean, lint 0 errors, typecheck clean, bun test 3502 tests (junit names equal to baseline, per-file counts equal with moved paths mapped; two timing tests flaked once under parallel browser load and passed 3/3 on rerun), test:browser 583 passed, build ok. git log --follow src/core/compose.ts shows pre-move history. core-*.js gzip 57053 -> 59900 B.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved src/replica/composers.ts (+test) to src/core/compose.ts and src/replica/version-minter.ts (+test) to src/core/ with git mv; switched the six replica importers and the edit-delivery skill path; no shim. Behaviour unchanged: the bun test junit list equals the baseline and the full check incl. browser tests is green. The core chunk grows by about 2.8 kB gzip on every page. Unblocks TASK-121.2, where the Builder preview composes through core.
<!-- SECTION:FINAL_SUMMARY:END -->
