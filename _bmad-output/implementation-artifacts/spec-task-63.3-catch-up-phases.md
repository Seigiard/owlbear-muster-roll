---
title: 'Bind catch-up and adoption data to their valid phases'
type: 'refactor'
created: '2026-11-14'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/replica/catch-up.ts` stores the displayed phase, active nonce, trigger, adoption target and incomplete retry delay separately. Maintainers must reconstruct which data is valid together and why an incomplete adoption cannot become live.

**Approach:** Preserve the synchronous `CatchUp` interface and all AD-6/AD-7/AD-9 behavior. Use one local production state with explicit initialization and phase-owned ordinary/adopting catch-up data. An active catch-up owns its nonce and trigger; adoption owns its target and retry state. Keep GM link and cross-phase answer history independent, and keep timers, staged records, persistence and replica replacement in the engine.

</frozen-after-approval>

## Implementation Notes

- Research: TASK-63.3 and CAP-3 in `_bmad-output/specs/spec-explicit-operation-state/` define the phase invariants. TASK-48 supplied the existing synchronous boundary, deterministic tests and mutation controls. TASK-63.2 passed its chain before this slice starts.
- Route: no unresolved user-facing choice, irreversible step or new public dependency. Production changes are limited to `src/replica/catch-up.ts`; use oneshot and delegated checks-only validation.
- Preservation: ordinary timeout can leave, incomplete adoption retries, failed adoption save retains old data and the target, page return can keep the active nonce, and stale read/request results remain ignored. Last nonce and accumulated parts survive an unanswered exit so late complete answers still update GM-answer knowledge.
- Independent dimensions: GM link, completed-first-catch-up knowledge, late-answer history, held requests and drift observations retain their existing lifetimes. Do not force these into a phase that discards them too early.
- Evidence owners: unchanged `catch-up.test.ts`, engine catch-up/liveness/no-GM/import/wipe suites, and `tools/mutants/catch-up.json` M1-M12. Refresh mutation anchors only as required by the new source representation.
- Verification: focused deterministic and engine suites, baseline/final M1-M12 controls, format, lint, typecheck, full unit, full browser and build. Record commands, exits, canonical revisions, phase invariants and before/after caller knowledge. The integration branch receives one combined closing review with TASK-63.2.
