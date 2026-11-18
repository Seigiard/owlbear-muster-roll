---
id: TASK-63.2
title: Make room-copy write phases and deferred work explicit
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T14:10:00Z'
updated_date: '2026-11-14T22:14:00Z'
labels:
  - architecture
  - state-model
dependencies:
  - TASK-63.1
references:
  - src/replica/room-copy.ts
  - src/replica/room-copy.test.ts
  - src/replica/engine-room-copy.test.ts
  - _bmad-output/implementation-artifacts/spec-task-50-room-copy-module.md
documentation:
  - _bmad-output/specs/spec-explicit-operation-state/SPEC.md
parent_task_id: TASK-63
type: task
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CAP-2. TASK-50 already placed room-copy policy behind RoomCopy. Inside that module, writing, rerun, owed, scheduled cancellation and writeRun jointly encode the operation lifecycle. An ordinary write and an import must serialize while saved-copy status remains independent. This slice makes those relationships explicit without moving ownership or broadening the interface. It follows projection delivery because it adds asynchronous port completion, read-back verification and generation replacement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One production state owns the active write phase and ordinary/import mode; deferred work and rerun requests have an explicit owner; saved-copy status remains independent of an in-flight operation.
- [x] #2 At most one ordinary/import metadata write lifecycle owns the write slot; an import waits for the preceding ordinary write, and triggers during a write produce the existing follow-up write rather than being lost.
- [x] #3 A write reports saved only after read-back verification; read, encoding, capacity, write and verification failures preserve the previous copy and required notices according to AD-8/AD-9.
- [x] #4 Visibility/resume changes, catch-up gating, higher generations, unreadable/older/newer copies and replacement preserve current behavior; stop and demotion retain their current guarantees without pretending to cancel a port call already started.
- [x] #5 Room-copy and import/wipe integration checks plus the project full check pass; task evidence records phase invariants and caller knowledge, and reuses TASK-50 behavioral/mutation oracles where applicable.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Refactor only src/replica/room-copy.ts into phase-owned ordinary/import operation state and explicitly owned deferred work; preserve independent saved-copy status and the public interface.
2. Reuse unchanged room-copy and engine room-copy/import/wipe tests plus applicable TASK-50 mutation controls. Preserve the documented import-after-demotion limitation.
3. Run the six project full checks, record phase invariants and before/after caller knowledge in spec-task-63.2-room-copy-phases.md, then run blind review and code review.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
RoomCopy now owns ordinary/import phase and completion in WriteLifecycle, with DeferredWork separate from saved-copy status. Interfaces and documented limitations stay unchanged. Verification: focused 120 pass; full unit 3009 pass/1 environment-only DOM skip; browser 520 pass; format/lint/typecheck/build pass. Baseline and final R1-R16 controls all killed; closing review restored the original dual-reset R13 mutation. Combined review: mixed 6/6, final 2/2, no blocking findings. An unverified direct-call import/pageHidden interleaving is deferred with its proof requirement. Evidence: spec-task-63.2-room-copy-phases.md. PR: https://github.com/Seigiard/owlbear-muster-roll/pull/26.
<!-- SECTION:FINAL_SUMMARY:END -->
