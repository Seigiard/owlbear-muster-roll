---
id: TASK-64.2
title: Move the room test rig out of production source
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-14T20:25:00Z'
updated_date: '2026-11-14T22:11:00Z'
labels:
  - architecture
  - tests
dependencies:
  - TASK-64.1
parent_task_id: TASK-64
type: task
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog TASK-47 made `src/replica/room-rig.ts` the one rig for the 18 engine test files. It is 626 lines of test infrastructure that sits beside shipped code and imports `@/ui/projection-store` and `@/ui/replica-client`, which is the only reason the replica layer still reaches into ui. Vite does not bundle it, so this is a boundary and readability problem, not a size problem. The lint task before this one leaves a single exemption for this file. TASK-63.2 and TASK-63.3 add engine tests through this rig in the same period; land this move on master before they branch, or rebase them on it, so the import path changes once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The rig lives under a test-only path (`tests/support/` or `src/replica/testing/`), and no file under `src/replica` outside that path imports from `@/ui`
- [x] #2 The lint exemption for `room-rig.ts` is gone and `bun run lint` passes without it
- [x] #3 Every engine test imports the rig from its new path; the engine test count is unchanged
- [x] #4 CLAUDE.md names the new rig path in the tests block
- [x] #5 The full check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Переместить src/replica/room-rig.ts в tests/support/room-rig.ts без изменения содержимого, кроме удаления устаревшего TASK-64.2 exemption comment.
2. Обновить все импорты room-rig на новый test-support путь и удалить dedicated lint override из .oxlintrc.json.
3. Обновить tests block в CLAUDE.md, сохранив тестовые helper re-exports и все тестовые случаи.
4. Зафиксировать baseline/final engine case counts и выполнить полный набор format, lint, typecheck, unit, browser и build checks с фактическими логами под controls/.
5. Закоммитить только изменения TASK-64.2; после review-01 и финальных проверок закрыть task/spec как Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Moved the rig verbatim to tests/support/room-rig.ts, updated 19 consumers, removed the dedicated Oxlint override, and updated CLAUDE.md. Baseline and final bun test runs each covered 3010 tests with 633 engine cases; final browser covered 520 tests. One intermittent link-picker failure was followed by a passing isolated rerun and full retry on unchanged state; the root cause was not proven. Full format, lint, typecheck, unit, browser, and build checks passed; detailed command output and exit statuses are in /Users/seigiard/.claude/artifacts/tdd-20261114-213052/64.2/controls.

Closeout: review-01 findings 1–4 were corrected in the targeted follow-up (exact controls directory, observed-failure wording with unproven cause, import grouping, and Bun-only/browser support documentation). Finding 5, the suggested spec-to-ticket link, was rejected because it was not a format or acceptance requirement and no failed run or ambiguity was evidenced. Final review 01-final.json used profile final with 2/2 healthy sources, zero findings, and zero open questions. No new deferred items were added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved the shared room rig to tests/support, removed its dedicated replica lint exemption, updated all consumers and test documentation, and preserved runtime behavior. AC1–5 are verified with the recorded structure, format, lint, typecheck, unit, browser, engine-count, and build evidence; the one intermittent unit failure passed on unchanged-state retries and its cause was not proven. Review-01 corrections passed the final healthy two-source review. No follow-up items, deployment, push, or PR.
<!-- SECTION:FINAL_SUMMARY:END -->
