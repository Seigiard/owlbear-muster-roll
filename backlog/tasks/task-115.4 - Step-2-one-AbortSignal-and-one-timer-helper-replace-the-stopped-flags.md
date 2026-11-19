---
id: TASK-115.4
title: 'Step 2: one AbortSignal and one timer helper replace the stopped flags'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T09:46:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The engine's one AbortController (from TASK-115.2) becomes the lifecycle of every replica module: options take signal: AbortSignal in place of stopped: () => boolean.
2. Every replica timer (dice-extension, scene-watch, proposal-queue, engine helpers, room-copy, pending-edits) goes through schedule(signal, ms, fn); setTimeout keeps one call site, in timers.ts.
3. Subscriptions and module stop() hooks hang on abort; a read that returns after stop() is dropped by signal.aborted; engine.stop() is one abort() plus the outbox flush. The five epoch counters stay.
4. Module tests port from stopped getters to an AbortController; engine suite against the baseline.
5. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.4); the implementer starts after TASK-115.6 is merged, since both rewrite the same lines; full check.
<!-- SECTION:PLAN:END -->
