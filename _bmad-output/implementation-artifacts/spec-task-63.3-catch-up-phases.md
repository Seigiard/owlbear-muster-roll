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
- Phase invariants: before this slice, `state`, `ownNonce`, `catchUpTrigger`, `adoptionTarget` and `incompleteRetryMs` were independently writable. The owner now has one `CatchUpPhase` union: explicit `initializing`, `live`, ordinary `catching-up`, or adopting `catching-up`. The active branch owns `nonce`, `trigger`, sent-request identity and answer-seen state. The adopting branch owns only its `target` and retry backoff. A live branch cannot carry either active catch-up or adoption data.
- Cross-phase knowledge: `lastNonce` and accumulated answer parts remain outside the phase so an unanswered exit can still record a late complete answer. GM link, first-catch-up knowledge, GM-answer knowledge, held requests and drift observations keep their independent lifetimes. Before and after, callers still use the synchronous `view()`, `live()`, `adopting()` and `answersOwn()` queries; they do not inspect phase storage. The engine still owns timers, room-copy reads, staged records, persistence and replica replacement.
- Baseline mutation control: `bun run mutants catch-up`, exit 0 on `9b1bf3d3ba366f8c0de2407cd622752e6e975fcd`, killed M1-M12 with 0 survived and 0 stale. Evidence: `~/.claude/artifacts/tdd-20261114-220338/63.3/controls/baseline-mutations.log`.
- Focused final control: `bun test src/replica/catch-up.test.ts src/replica/engine-catch-up.test.ts src/replica/engine-liveness.test.ts src/replica/engine-no-gm.test.ts src/replica/engine-import.test.ts src/replica/engine-wipe.test.ts` passed 172 tests and 175 assertions on production revision `7ecbc983ca2129c9c41e59ec7ab45f1cb70d6bd7`; the unchanged deterministic suite passed 48 tests and 48 assertions. The final mutation control killed M1-M12 with 0 survived and 0 stale on the same revision. Evidence: `~/.claude/artifacts/tdd-20261114-220338/63.3/controls/final-mutations.log`.
- Full checks: on `7ecbc983ca2129c9c41e59ec7ab45f1cb70d6bd7`, `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` and `bun run build` all exited 0. Format matched 337 files; lint reported 169 warnings and 0 errors; unit tests reported 3009 pass, 1 environment skip, 0 fail and 9160 assertions; browser tests reported 520 passed; Vite built 1673 modules. Evidence: `~/.claude/artifacts/tdd-20261114-220338/63.3/controls/full-format.log`, `full-lint.log`, `full-typecheck.log`, `full-unit.log`, `full-browser.log` and `full-build.log`.
