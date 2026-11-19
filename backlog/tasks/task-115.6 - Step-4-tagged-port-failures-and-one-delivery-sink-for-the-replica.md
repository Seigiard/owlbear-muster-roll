---
id: TASK-115.6
title: 'Step 4: tagged port failures and one delivery sink for the replica'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T11:34:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Port failures become better-result TaggedError classes in src/platform/ports.ts (StorageFailure, SendFailure, PartyReadFailure, PlayerReadFailure, MetadataFailure, DiceExtensionFailure); party.getPlayers, player.getRole, metadata.getMetadata and notification.show return Result through Result.tryPromise in both adapters; the port contract asserts tag and fields.
2. src/replica/failures.ts exports ReplicaFailure (port classes plus send-dropped, record-too-large, message-rejected, open-request-lost, propose-dropped) and report(); the engine keeps a bounded recent list and publishes it in the projection as the diagnostics notice; the console is one subscriber.
3. Each module decides its policy with an exhaustive match; the 86 console.error calls in src/replica become match arms or report calls; silent zod rejections and oversized drops are reported.
4. deniesEdit returns its cause; the window shows too-large apart from denied (new copy in src/copy.ts).
5. Tests read the failure list instead of spyOn(console, 'error').
6. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.6); junit lists against the baseline; grep -c console.error src/replica is 1; full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-115-6-failure-sink (c5c30c1, merged with epic as 5699f49). Seven TaggedError port failures in src/platform/ports.ts with plain-data fields, NotificationFailure new; metadata/party/player reads and notification.show return Result. src/replica/failures.ts: ReplicaFailure, the replica's own tagged failures (send-dropped, record-too-large, message-rejected, open-request-lost, propose-dropped), createFailureSink({limit, now}) with DIAGNOSTICS_LIMIT 20. Every replica module takes report; the engine creates one sink per client, publishes recent() as the projection field diagnostics, and the console subscriber is the one console.error left in src/replica production (87 -> 1). Denial carries cause (gone, denied, too-large); copy editTooLarge 'Правка слишком большая'. Checks on 5699f49: fmt, lint, typecheck, build; browser 583/583; bun: no baseline line lost except two renames recorded in deferred-work.md. Calibrated both false-green rows.
<!-- SECTION:NOTES:END -->
