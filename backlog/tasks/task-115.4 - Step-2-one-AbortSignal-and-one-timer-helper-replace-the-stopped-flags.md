---
id: TASK-115.4
title: 'Step 2: one AbortSignal and one timer helper replace the stopped flags'
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T19:41:00Z'
updated_date: '2026-11-19T15:33:00Z'
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
- [x] #2 Every timer in `src/replica` goes through `schedule(signal, ms, fn)`; `setTimeout` has one call site under `src/replica`
- [ ] #3 `engine.stop()` aborts the signal and flushes the outbox and nothing else; the five epoch counters are unchanged
- [x] #4 `engine.ts:740-797` is byte-identical to its base until TASK-114.2 is merged; engine suite junit list equals the baseline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The engine's one AbortController (from TASK-115.2) becomes the lifecycle of every replica module: options take signal: AbortSignal in place of stopped: () => boolean.
2. Every replica timer (dice-extension, scene-watch, proposal-queue, engine helpers, room-copy, pending-edits) goes through schedule(signal, ms, fn); setTimeout keeps one call site, in timers.ts.
3. Subscriptions and module stop() hooks hang on abort; a read that returns after stop() is dropped by signal.aborted; engine.stop() is one abort() plus the outbox flush. The five epoch counters stay.
4. Module tests port from stopped getters to an AbortController; engine suite against the baseline.
5. tdd chain (run ~/.claude/artifacts/task-115-20261119/TASK-115.4); the implementer starts after TASK-115.6 is merged, since both rewrite the same lines; full check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on task-115-4-abort-signal (f218c62). The engine owns one AbortController; every replica module takes signal in place of a stopped getter, and every timer goes through schedule(signal, ms, fn): setTimeout has one call site under src/replica (timers.ts). Subscriptions and module stop work hang on abort; engine.stop() is one abort(); the outbox discards held records on abort as it did on stop (DESIGN correction in deferred-work.md). The five epoch counters are unchanged. Checks: fmt, lint, typecheck, build; browser 583/583; bun: 8 lock renames, nothing else lost. Calibrated the three false-green rows.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
One engine AbortController replaces the stopped getters (PR #68): modules take signal, timers go through schedule, stop() is one abort(). Deviations recorded in deferred-work.md and DESIGN.md: stop() discards held outbox commits instead of flushing them (AC #3 was written wrong; discard was the existing, correct behavior), and 'stopped' also remains as a dice result code besides the room-copy phase (AC #1). Epoch counters unchanged; junit baseline held. AC #1 and #3 are left unchecked for those reasons.
<!-- SECTION:FINAL_SUMMARY:END -->
