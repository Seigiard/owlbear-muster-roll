---
id: TASK-63.1
title: Keep projection assembly data valid for its delivery phase
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T14:09:00Z'
updated_date: '2026-11-14T20:52:00Z'
labels:
  - architecture
  - state-model
dependencies:
  - TASK-61.8
references:
  - src/ui/replica-client.ts
  - src/ui/replica-client.test.ts
  - src/replica/engine-client.test.ts
documentation:
  - _bmad-output/specs/spec-explicit-operation-state/SPEC.md
parent_task_id: TASK-63
type: task
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CAP-1. replica-client.ts names requesting, assembling and live, but assembly, nonce, buffered messages, engine identity and sequence are separate mutable values. A maintainer must reconstruct which values count in each phase. This is the smallest new slice because it has a local delivery owner and an existing public interface. TASK-61.8 is a sequencing dependency for learning from the accepted picker model, not a runtime dependency; the picker keeps its existing owner and live-room criterion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The production delivery state ties assembly to the assembling phase and engine/sequence to live; requesting cannot accidentally expose an old assembly as current, and phase has one writable owner.
- [x] #2 Incomplete or mismatched projections never publish partial records; obsolete nonces are ignored; incomplete assembly re-requests according to the existing timeout.
- [x] #3 Engine replacement or a sequence gap starts a new projection request; buffered command answers survive re-request and old-stream deltas are discarded; complete assembly replays valid deltas in order.
- [x] #4 Queued request suppression, command settlement, open-sheet handling and stop cleanup preserve existing observable behavior through the unchanged ReplicaClient interface.
- [x] #5 Existing client/integration checks and the project full check pass; task evidence compares phase invariants and caller knowledge before/after, with an independent oracle stated before any test edits.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model projection delivery as one local discriminated state: requesting owns the acquisition nonce and buffered answers, assembling owns the nonce and assembly descriptor while buffering deltas, and live owns engine identity and sequence.
2. Narrow message, replay, recovery, timer, and cleanup handlers through that state without changing ReplicaClient, queue identity, or pending command lifetimes.
3. Record the research, before/after ownership, and verification evidence in the task spec; run the focused baseline and final six checks, then commit production code separately from evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented phase-owned projection delivery in src/ui/replica-client.ts. Existing ReplicaClient behavior is preserved; no test files changed. Focused tests passed 153/153, full unit passed 3009 with one environment-only DOM skip, browser passed 520, and format, lint, typecheck, and build passed. Durable logs and before/after ownership evidence are recorded in _bmad-output/implementation-artifacts/spec-task-63.1-projection-delivery.md; parent owns review and finalization.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Projection delivery now uses one phase-owned union while the ReplicaClient interface stays unchanged. Existing focused tests passed 153/153; the full unit suite passed 3009 tests with one environment-only DOM skip; browser tests passed 520; format, lint, typecheck, and build passed. Production revision: a8101d4fe50a17955fbcf13b8aa5a4bef3b80c42. Deferred: a conditional fully synchronous replacement during old-buffer replay remains unverified; no production producer was demonstrated, and proof requires showing a remaining old-stream delta or answer after a real inline replacement.
<!-- SECTION:FINAL_SUMMARY:END -->
