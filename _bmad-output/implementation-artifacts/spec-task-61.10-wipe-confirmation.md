---
title: 'Wipe confirmation through a pure reducer'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The wipe confirmation flow keeps confirmation, command-waiting, and outcome transitions in the React hook. This couples behavior decisions to rendering and makes the destructive flow harder to exercise independently.

**Approach:** Extract the existing wipe transitions into one pure, flow-specific reducer module and run it with `useReducer` in `wipe-actions.tsx`. Preserve the current confirmation, cancellation, catch-up blocking, command outcome, failure message, and focus behavior exactly. The component remains responsible for sending the wipe command and applying browser focus.

**Constraints:** The reducer has no React or DOM dependency. Do not create a generic/shared settings-flow helper, machine runtime, or framework; this reducer is only for wipe. Do not change `tests/wipe.e2e.ts`, add tests in this bootstrap, or implement preset upload or snapshot import.

</frozen-after-approval>

## Implementation Notes

- Bootstrap extraction keeps the reducer flow-specific and leaves command dispatch and browser refocus in `wipe-actions.tsx`; payoff evidence remains pending the later reducer tests and review.
- Review-1 evidence and triage: the reducer seam now has direct exact-transition coverage for confirm, cancel, repeated-send suppression while wiping, re-ask remounting, catch-up cancellation and blocking, repeated-confirm suppression, successful settlement, catch-up message clearing, refused outcomes, and timed-out outcomes. Calibration-2 independently calibrated confirm, cancel, wiping-ask suppression, the timed-out failure mutation, and catch-up blocking; review-1 records that the combined refused/timed-out assertion was not independently calibrated for refusal. Review-1 exposed the asking-state re-ask regression, whose red assertion is repaired locally by allowing `ask` from `idle` or `asking` only when not catching up, while still refusing `wiping` and catch-up actions. Review-1 also triaged optional stale/foreign-outcome coverage as deferred because the identity guard is correct without a demonstrated regression, and recorded the late catching-up refusal as pre-existing and outside this preservation repair; both are recorded in `deferred-work.md`. The shape paid off, so preset upload and snapshot import remain separate follow-up tasks, not a shared settings-flow helper; the spec remains in progress and its frozen intent is unchanged.

- Final evidence at calibrated code state `9f1a10b93ba06918a58a30ce491d5932ea776aa9`: all 11 current reducer assertions were independently calibrated, with each faithful mutation red on its owner assertion and every restore clean. The old combined refused/timed-out calibration is superseded by separate refused and timed-out mutations. The focused reducer command `bun test src/ui/settings/wipe-actions-reducer.test.ts` passed with 11 tests and 0 failures; the full unit command `bun test` passed with 2947 tests, 1 environment skip and 0 failures; `bun run test:browser` passed with 519 tests; `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck` and `bun run build` passed, with the build transforming 1669 modules. The locked reducer test remains byte-identical to `1503f9c58090e7c0e197a3442829f7c256b1e904`, and `tests/wipe.e2e.ts` remains unchanged from `df30234fa3f915a330e9d4d48841412a0bcf0ae8`.

## Review Triage Log

- Review-1 finding 1 (`bugs-1`): a repeated `ask` while already asking failed to increment the request and remount the confirmation. A real reducer assertion was red before the repair; the reducer now increments the ask count for non-catching-up `idle` and `asking` states while retaining the wiping and catch-up guards, and the assertion was calibrated red and restored green.
- Review-1 finding 2 (Blind Hunter): coverage did not prove `asking -> catch-up-started -> confirm` stays idle. The locked test was extended, the exact idle result is covered, and its faithful mutation was independently calibrated red and restored green.
- Review-1 finding 3 (Blind Hunter): coverage did not prove a second `confirm` while wiping preserves the original in-flight command. The locked test now checks object identity, and its faithful mutation was independently calibrated red and restored green.
- Review-1 finding 4 (Blind Hunter): successful settlement and normal catch-up-message clearing needed direct lifecycle coverage. Both are covered and independently calibrated; optional stale or foreign outcome unit polish remains deferred because the identity guard is correct and no regression was shown.
- Review-1 finding 5 (Blind Hunter): the spec and task payoff evidence was stale and named machine-local calibration evidence without describing it. The implementation notes and task record now state the calibrated transitions, the regression repair, the checks, and the separate follow-up decision without machine-local artifact links.
- Review-1 finding 6 (independent-refusal calibration): the earlier combined refused/timed-out mutation did not independently prove the refused branch. Refused and timed-out outcomes now have separate faithful mutations, red runs and restore checks; the combined evidence is superseded.
- Separate pre-existing review-1 finding (`adversarial-2`): a catching-up refusal delivered after catch-up ends can leave the loading message until the next action. It remains deferred in `deferred-work.md` and was not changed by this preservation repair.
- Final review-2 outcome: the `final` profile completed with 2/2 sources reported and no degraded source. It found 0 critical, 0 major and 0 minor blocking findings, 0 open questions, and no newly raised pre-existing entries. All six required gates had current passing evidence; styling review was skipped because no styling changed. The review accepted the state, routed no fixes, and authorized documentation and status closeout only. TASK-61.11 and TASK-61.12 remain unimplemented follow-ups, and the two deliberate deferrals remain recorded above and in `deferred-work.md`.
