---
id: TASK-63.1
title: Keep projection assembly data valid for its delivery phase
status: To Do
assignee: []
created_date: '2026-11-14T14:09:00Z'
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
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CAP-1. replica-client.ts names requesting, assembling and live, but assembly, nonce, buffered messages, engine identity and sequence are separate mutable values. A maintainer must reconstruct which values count in each phase. This is the smallest new slice because it has a local delivery owner and an existing public interface. TASK-61.8 is a sequencing dependency for learning from the accepted picker model, not a runtime dependency; the picker keeps its existing owner and live-room criterion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The production delivery state ties assembly to the assembling phase and engine/sequence to live; requesting cannot accidentally expose an old assembly as current, and phase has one writable owner.
- [ ] #2 Incomplete or mismatched projections never publish partial records; obsolete nonces are ignored; incomplete assembly re-requests according to the existing timeout.
- [ ] #3 Engine replacement or a sequence gap starts a new projection request; buffered command answers survive re-request and old-stream deltas are discarded; complete assembly replays valid deltas in order.
- [ ] #4 Queued request suppression, command settlement, open-sheet handling and stop cleanup preserve existing observable behavior through the unchanged ReplicaClient interface.
- [ ] #5 Existing client/integration checks and the project full check pass; task evidence compares phase invariants and caller knowledge before/after, with an independent oracle stated before any test edits.
<!-- AC:END -->
