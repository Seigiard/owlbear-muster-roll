---
title: 'Make room-copy write phases and deferred work explicit'
type: 'refactor'
created: '2026-11-14'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/replica/room-copy.ts` represents write ownership with independent `writing`, `rerun`, `owed`, scheduled cancellation, and completion values. Maintainers must reconstruct which ordinary or import phase owns the write slot and which work remains due.

**Approach:** Keep the existing `RoomCopy` interface and behavior. Use local phase-specific production state to own the ordinary/import operation and its completion. Give scheduled and deferred work explicit ownership without combining independent saved-copy status with the operation. Preserve AD-8/AD-9 ordering, verification, generation handling, visibility gates, stop behavior, and the documented import-after-demotion limitation.

</frozen-after-approval>

## Implementation Notes

- Research: TASK-63.2, CAP-2 in `_bmad-output/specs/spec-explicit-operation-state/`, and TASK-50 define the preservation contract. TASK-63.1 is complete and used a local discriminated state without widening its public interface.
- Route: no unresolved intent choices or irreversible steps; one existing production module changes, with no new public dependency. Use the oneshot route and the delegated TDD checks-only path.
- Code boundary: `createRoomCopy` retains its metadata calls and injected engine queries. `src/replica/engine.ts`, `src/core/`, platform adapters, snapshot formats, room messages, timeouts, UI, and catch-up ownership stay unchanged.
- Existing evidence owners: `src/replica/room-copy.test.ts`, `engine-room-copy.test.ts`, `engine-import.test.ts`, and `engine-wipe.test.ts`. Reuse their behavioral assertions and relevant TASK-50 R1-R16 mutations. No new source-shape tests.
- Verification: focused room-copy/import/wipe suites; format, lint, typecheck, full unit suite, full browser suite, and build. Record commands, exit codes, revision, logs, phase invariants, and before/after caller knowledge.
