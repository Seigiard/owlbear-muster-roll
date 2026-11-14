---
title: 'Make room-copy write phases and deferred work explicit'
type: 'refactor'
created: '2026-11-14'
status: 'in-review'
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
- Phase ownership: `WriteLifecycle` owns the active ordinary or import operation, its `reading`/`writing`/`verifying` phase, and its completion promise. `DeferredWork` owns the owed flag, rerun request, and scheduled cancellation. The saved-copy status (`notSaved`, `exists`, sizes, outcome and compatibility notice) remains outside both owners.
- Phase invariants: at most one active lifecycle has a completion handle; an import awaits that handle before starting; a trigger during an active lifecycle sets one deferred rerun; ordinary verification clears owed work only after read-back holds, while import verification keeps AD-9 replacement and supersession rules. `stopped` retains an already-started operation reference without claiming to cancel its metadata call.
- Caller knowledge before/after: callers know only the existing `RoomCopy` methods and the injected gate, role, generation and records queries before and after this slice. They do not inspect lifecycle or deferred state, and no public interface, message, storage or timeout contract changed. The superseded-import early return still exits before the follow-up tail; the documented import-after-demotion limitation remains unchanged.
- Mutation evidence: the baseline at `3163867e49ac1015f0fee273636f7911d510ea87` killed TASK-50 R1-R16 (16/16). The final run uses the refreshed anchors in `tools/mutants/room-copy.json` and must report behavioral assertion failures for every mutant, not compilation failures.
- Final validation at `bfff746ba23d4fa2728c768af965ac4136ed4298`: focused 120 pass; full unit 3009 pass, 1 environment-only DOM skip; browser 520 pass; format, lint, typecheck and build exit 0. Baseline and final mutation runs each killed all R1-R16 on behavioral assertions, with no stale controls. Tests remain unchanged. Evidence: `/Users/seigiard/.claude/artifacts/tdd-20261114-220338/63.2/implementer-1.report.md` and its named command/exit/log files.
- Integration: the user requested TASK-63.3 and closure of TASK-63 in one PR. Both slices receive one closing code review on the integration branch; this slice has passed its chain validation.
