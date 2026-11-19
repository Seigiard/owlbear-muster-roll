---
id: TASK-121.1
title: Move composers.ts to src/core/compose.ts
status: To Do
assignee: []
created_date: '2026-11-19T07:45:00Z'
updated_date: '2026-11-19T08:01:00Z'
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
- [ ] #1 `src/core/compose.ts` exports exactly what `src/replica/composers.ts` exported; `git log --follow` shows the move; `src/replica/composers.ts` is gone and nothing in `src` imports `@/replica/composers`
- [ ] #2 `src/core/compose.ts` imports only `@/core/**`; `bun run lint` passes with the `src/core/**` no-restricted-imports override
- [ ] #3 Full check passes and the `bun test` junit list equals the master baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Spec: _bmad-output/implementation-artifacts/spec-task-121-1-compose-to-core.md (ready-for-dev)
<!-- SECTION:PLAN:END -->
