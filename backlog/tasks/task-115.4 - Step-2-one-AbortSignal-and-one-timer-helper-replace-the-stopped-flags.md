---
id: TASK-115.4
title: 'Step 2: one AbortSignal and one timer helper replace the stopped flags'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - architecture
  - replica
dependencies:
  - TASK-115.2
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stopping is a `stopped` flag in six modules read at 126 places, four styles of timer ownership and a `stop()` of thirteen calls (`engine.ts:1393-1413`, `room-copy.ts`, `commit-outbox.ts:42`, `scene-watch.ts:24`, `dice-extension.ts:97`, `proposal-queue.ts:389`); a forgotten check after an await is a race the tests catch only by timing. The engine owns one `AbortController`, helpers take `signal` in place of `stopped: () => boolean`, subscriptions hang on abort, a read that returns after `stop()` is dropped by `signal.aborted`, and `stop()` is one `abort()` plus the outbox flush. Owner decisions Q6 and Q7: one PR over all six modules, in parallel with TASK-114, leaving the `heldOpen` block at `engine.ts:740-797` untouched until TASK-114.2 is merged; the five epoch counters stay, because they detect a superseded answer, not a stop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No module under `src/replica` takes a `stopped` getter; `grep stopped src/replica` finds only the `room-copy` phase name
- [ ] #2 Every timer in `src/replica` goes through `schedule(signal, ms, fn)`; `setTimeout` has one call site under `src/replica`
- [ ] #3 `engine.stop()` aborts the signal and flushes the outbox and nothing else; the five epoch counters are unchanged
- [ ] #4 `engine.ts:740-797` is byte-identical to its base until TASK-114.2 is merged; engine suite junit list equals the baseline
<!-- AC:END -->
