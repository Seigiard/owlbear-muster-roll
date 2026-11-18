---
id: TASK-115.6
title: 'Step 4: tagged port failures and one delivery sink for the replica'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - architecture
  - replica
  - platform
dependencies:
  - TASK-115.3
  - TASK-114.2
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Failures leave the replica through 86 `console.error` calls in seven patterns; `SendFailure` and `StorageFailure` are object literals with no exhaustive handling; `deniesEdit` (`pending-edits.ts:561`) shows `too-large` as "Нет прав на правку"; zod rejections and oversized drops are silent; the window never learns of a failed send, a role read that keeps the old role, a lost open request or a dropped propose. Owner decision Q10, the hybrid: policy in the module through an exhaustive `match`, delivery through one `report(failure: ReplicaFailure)` in `src/replica/failures.ts`, a bounded list published in the projection as the `diagnostics` notice, the console one subscriber. Error classes are `TaggedError` subclasses in `ports.ts`, not in core (ADR-0003). After TASK-114.2, so its new parse drop goes through `report` from the start.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each port failure is a `TaggedError` class in `src/platform/ports.ts`; the four rejecting port methods return results in both adapters and the port contract asserts tag and fields
- [ ] #2 `src/replica/failures.ts` exports `ReplicaFailure` and `report`; the engine publishes a bounded recent list as the `diagnostics` notice
- [ ] #3 `deniesEdit` returns its cause and the window message distinguishes `too-large` from `denied`
- [ ] #4 Every module that sees a failure union handles it with an exhaustive `match`; `grep -c console.error src/replica` is 1
- [ ] #5 Tests read the failure list instead of `spyOn(console, "error")`; engine suite junit list equals the baseline
<!-- AC:END -->
