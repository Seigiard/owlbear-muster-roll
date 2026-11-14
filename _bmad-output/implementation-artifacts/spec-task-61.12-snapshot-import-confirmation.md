---
title: 'Snapshot-import confirmation through a pure reducer'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Snapshot-import confirmation transitions live inside `src/ui/settings/snapshot-actions.tsx`. This makes transition checks depend on React instead of a direct pure boundary.

**Approach:** Move the existing transitions into one flow-specific pure reducer and run it with `useReducer` in the existing component. Preserve file errors, check results, confirmation even for zero dropped values, cancellation, catch-up cancellation, changed-count re-asking, command outcomes, stale-result handling, messages, and refocus.

**Constraints:** The component keeps file reading, snapshot-check requests, snapshot-import command dispatch, and browser effects. The reducer has no React or DOM dependency. Follow ADR-0002 and the local wipe boundary from TASK-61.10. Introduce no generic settings-flow or upload framework or helper. Existing applicable browser tests remain unchanged.

</frozen-after-approval>

## Implementation Notes

- Scope: `src/ui/settings/snapshot-actions.tsx`, a flow-specific reducer beside it, direct reducer tests, and task/spec records. No intent gaps or irreversible actions were found.
- Preservation authority: the component before this refactor, `tests/snapshot.e2e.ts`, the snapshot case in `tests/catch-up.e2e.ts`, and the completed snapshot-import specification `spec-5-3-replace-the-room-from-a-snapshot.md`.
- Validation starts with a checks-only extraction because importing a missing reducer would fail during setup, not on behavior. Direct tests follow at the established seam; initially green assertions remain uncalibrated until faithful reducer mutations make their owner assertions fail.
- `src/ui/settings/snapshot-actions-reducer.ts` now owns the flow-specific transitions. The existing hook owns `useReducer`, file reads, snapshot-check requests, snapshot-import commands, promise settlement, and refocus. The reducer preserves state identity when an obsolete outcome arrives. No shared framework was added.
- Direct coverage has 17 tests. The independent preservation authority is the pre-refactor component at `840ed10a0e799e800551a75916c481283ec2f9a8`, unchanged browser contracts, and the completed snapshot-import specification. A review correction uses a nonzero file-error confirmation counter.

## Review Triage Log

- Blind Hunter B1: fixed, test-only. File-error counter preservation now starts at `ask: 4`; a faithful reset-to-zero mutation fails that exact assertion. Production already preserved the counter.
- Blind Hunter B2: rejected. Confirm/cancel handlers and catch-up dispatch exist only while asking. The proposed wrong-phase events are not produced by the component; no behavior defect was shown.
- Blind Hunter B3: rejected as duplicate coverage. Ordinary refusal handling precedes the checking/importing phase split. Its rule and snapshot message mapping already have direct owners; no distinct checking-refusal rule was missed.
- Blind Hunter B4: rejected as duplicate coverage. One phase/state/request guard rejects obsolete check and import results before inspecting the result kind. Tests already exercise reset, replacement request, and confirmation destinations.
- Blind Hunter B5: rejected as a hypothetical purity defect. The reducer does not write to input states or call mutating code; it constructs a result or returns the input. No mutation defect was demonstrated.
- Focused review: no new findings or open decisions. Both expected sources reported without degradation. The parent inspected successful tool results for the zero-finding `bugs` source and the adversarial inspection trail. CSS review was skipped because no styling changed.
- Pre-existing finding: an older snapshot file read can replace a newer selection. Both baseline and candidate await the read before unconditionally starting its check. This is a source-backed race candidate, not a reproduced user incident; it is recorded in `deferred-work.md` and is outside this behavior-preserving extraction. No follow-up task was created or started.

## Final Evidence

- Reviewed candidate and final test lock: `a01835516ce9724f971cf28ea86f30a0297c0123`. Production source is byte-identical to `c030349687c1cc03f17168ff15abc42a2613b7d8`, the source state used by the final browser and build checks.
- All 17 direct tests passed. Each failed on its own assertion under a faithful reducer mutation; 18 mutations passed calibration, including the additional file-error counter check. The source and locked tests were restored exactly, with unchanged HEAD and a clean worktree. No setup, import, syntax, or runtime error counted as assertion-red evidence.

| Acceptance criterion | Evidence |
| --- | --- |
| AC1: Pure reducer with direct coverage; component-owned `useReducer` | Flow-specific reducer, 17 calibrated tests, existing hook owns `useReducer`. |
| AC2: Component-owned commands and browser effects | File reads, check requests, command sends, settlement effects, and refocus remain in the hook; reducer has no React or DOM dependency. |
| AC3: No shared framework | Only the existing component and its local reducer changed in production. |
| AC4: Existing browser behavior | `tests/` is byte-identical to the preservation baseline; 20 applicable focused tests and all 520 browser tests passed. |

| Repository gate | Result |
| --- | --- |
| `bunx oxfmt --ignore-path .gitignore --check .` | Passed |
| `bun run lint` | Passed; 170 existing warnings, 0 errors, no new warnings |
| `bun run typecheck` | Passed |
| `bun test` | 2983 passed, 1 environment-precondition skip, 0 failed |
| `bun run test:browser` | 520 passed |
| `bun run build` | Passed |

The closeout changes documentation only. Runtime and test evidence remains valid because its covered source is unchanged. Mock browser checks do not prove live Owlbear behavior. No deployment or platform change was made.
