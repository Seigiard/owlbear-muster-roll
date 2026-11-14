---
title: 'Preset-upload confirmation through a pure reducer'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The preset-upload confirmation flow keeps its transitions in `src/ui/preset-actions.tsx`, alongside React rendering and browser effects. This couples transition checks to the component instead of providing a direct pure boundary.

**Approach:** Extract the existing preset-upload confirmation transitions into one flow-specific pure reducer module and run it with `useReducer` in `src/ui/preset-actions.tsx`. Preserve file-error handling, diff results, zero-loss upload, confirmation and cancellation, changed-loss re-asking, catch-up cancellation, command outcomes, late-answer handling, messages, and refocus behavior.

**Constraints:** The component keeps preset-upload command dispatch, file reading, and browser effects, including refocus. The reducer has no React or DOM dependency. Follow the local boundary validated by TASK-61.10 and ADR-0002, without a shared settings-flow or upload framework, runtime, or helper. Limit production changes to the component and its new reducer module, with direct reducer tests beside the reducer. Keep applicable existing preset-upload browser tests unchanged. Wipe, snapshot import, replica behavior, and interface copy are outside this refactor.

</frozen-after-approval>

## Implementation Notes

- 2026-11-14: Commit `bc5372651155d20f9f3b81fc537cedc8e541444c` extracts the preset-upload state and outcome transitions into `src/ui/preset-upload-reducer.ts`. `src/ui/preset-actions.tsx` now owns `useReducer`, command dispatch, file reading, late-result cleanup, and refocus. Zero-loss upload uses a local `send` phase and a component-side identity guard so a pure transition does not send twice.
- Verification on the bootstrap implementation state passed: focused preset browser tests (48 passed), full browser tests (519 passed), unit tests (2947 passed and 1 skipped), build, typecheck, lint (169 existing warnings and 0 errors), and format.
- The checks-only bootstrap left direct reducer tests and mutation-red calibration to the later test-writer phase. It did not claim AC1 direct coverage or change test files. Final evidence follows below.

- 2026-11-14: Follow-up cleanup releases `sentZeroLoss.current` whenever the upload state leaves the local `send` phase. The identity guard still runs before the zero-loss command dispatch, so StrictMode effect replay cannot send the same preset twice. This is a reference-lifetime correction only; it adds no public behavior.

## Review Triage Log

- Bootstrap Blind Hunter finding 1: **fixed**. The zero-loss handoff reference is cleared after leaving `send`, while the existing identity guard preserves duplicate-send protection during effect replay. No heap-test instrumentation or behavioral change was added.
- Bootstrap Blind Hunter finding 2: **deferred, pre-existing**. An older file read can replace a newer selection. Both versions await the read before unconditionally setting its result. This is a source-backed candidate, not a reproduced defect or observed user incident. The existing entry in `deferred-work.md` remains the only deferred entry; this task adds no attempt IDs.
- Bootstrap Blind Hunter finding 3: **rejected, unverified/pre-existing**. Zero-loss upload does not set the confirmation refocus flag in either version. No browser observation demonstrates focus loss. New focus semantics would exceed preservation intent.
- Bootstrap Blind Hunter finding 4: **rejected, no shown normal synchronous failure**. Transport send runs in a queued microtask with a promise catch. No reachable normal synchronous failure was demonstrated. A throwing `sendCommand` stub would construct a hypothetical path, not establish an occurrence. No generic exception handling was added.

## Final Evidence

- Runtime evidence matches commit `79b2332cd3e6fc997b087151d483608cc60108fd`. Calibration restored the full diff and clean tree to that state. Documentation closeout changes no source or tests.
- Locked test `src/ui/preset-upload-reducer.test.ts` remains byte-identical to lock commit `5ccb8a15c9006d471509a63bda2784f7ee6f91b2`. Its 19 direct tests passed. All 19 independently failed under faithful reducer mutations at their exact owner assertions, not during setup. The final restored run passed all 19.
- The independent preservation oracle was the pre-refactor component at `4548d22b5a74fde1c2d1ac0d2bc5c9e1078f4039`, unchanged browser contracts, and ADR-0002. Calibration covers file errors, diff results, zero-loss handoff, confirmation, cancellation, catch-up, changed-loss re-asking, outcomes, messages, and stale results.

| Acceptance criterion | Evidence |
| --- | --- |
| AC1: Flow-specific pure reducer and component-owned `useReducer` | `src/ui/preset-upload-reducer.ts` owns transitions; 19 calibrated direct tests cover the seam. `src/ui/preset-actions.tsx` owns `useReducer`. |
| AC2: Component-owned commands and browser effects | The component retains dispatch, file reading, async settlement cleanup, and refocus. The reducer has no React or DOM dependency. |
| AC3: No shared framework | Production changes are limited to the upload component and its flow-specific reducer. No generic settings-flow or upload helper was introduced. |
| AC4: Unchanged browser coverage | `tests/` is unchanged from the pre-refactor baseline. The final full suite passed all 519 tests, including applicable preset-upload tests. The earlier focused upload run passed 48. |

All six repository gates passed on the same runtime and test source:

| Gate | Result |
| --- | --- |
| `bunx oxfmt --ignore-path .gitignore --check .` | Passed |
| `bun run lint` | Passed: 170 warnings, 0 errors; one warning is new in the boundary test, not pre-existing. |
| `bun run typecheck` | Passed |
| `bun test` | 2966 passed, 1 environment skip, 0 failed |
| `bun run test:browser` | 519 passed |
| `bun run build` | Passed |

The final review used the **focused** profile. The default mixed profile was narrowed for the local residual gap. Review round 1 exited 0. Both expected sources reported: `bugs` and `adversarial`, with 0 raised each and no degraded sources. Findings, open questions, pre-existing findings, and immaterial findings were all empty. The parent checked successful Claude read output and the Codex inspection trail for the diff, component, reducer, tests, and callers. Neither source had tool failures. CSS review was skipped because markup and classes were unchanged.

The closeout reuses runtime, lint, typecheck, unit, browser, and build results because their covered source is unchanged. The full documentation format check passed across 331 files. The frozen Intent remains byte-identical. No platform or deployment changes were made. Mock browser results do not prove live Owlbear behavior. No follow-up task was created or started.
