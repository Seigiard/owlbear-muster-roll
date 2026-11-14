---
title: 'Run the link picker through a pure reducer'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The link picker keeps label reads, link outcomes, replica arrival, label writes, notification and popover close rules in React state, refs and effects. This couples the rule ordering to rendering and makes the second-flow matrix unavailable at the production reducer boundary.

**Approach:** Extract the existing link-picker rules into `src/ui/picker/link-picker-reducer.ts`. Run the reducer with `useReducer` in `src/ui/picker/link-picker.tsx`; keep the link command, label ports, notification, close and bounded waits in that component. Preserve the retry attempt counter for same-target picks and leave live Owlbear label persistence and popover closure for the owner check.

</frozen-after-approval>

## Implementation Notes

- The prototype caller stays historical. It is not copied into production, and production uses semantic reducer state rather than a generic effect list or effect ids.
- Existing component and browser tests remain unchanged. The adjacent reducer tests migrate the TASK-61.6 rule matrix with literal expectations and mutation controls.
- The batch-2 terminal-eligibility fix is complete: successful close now makes `canPick` and `canOffer` false, and rendered target/label controls use those selectors. A rejected close still clears the attempt and permits a same-target retry. At that stage, AC5 still required the owner's live Owlbear check; the later owner-reported results below complete it.

### Review Triage Log

- `bugs-1` is fixed: terminal reducer eligibility includes `closed`, and the component derives both control disabled states from `canPick`/`canOffer`.
- `bugs-2` is deferred. The current caller has stable `scene`, `notification`, `timing` and `onLinked` props, so no reachable defect was shown. The stable-prop lifetime limitation is intentionally not fixed; a general lifecycle solution would exceed this local correction.
- Blind-review disposition 1 (prop-identity cleanup): rejected as a fix for the same stable-prop limitation; intentionally not fixed.
- Blind-review disposition 2 (closed selectors): fixed through `bugs-1`; no duplicate control logic was added.
- Blind-review disposition 3 (demotion between arrival render and label write): deferred as unverified. No defect is claimed. The exact control is recorded in `deferred-work.md`: deliver the role update after the reducer selects writing but before `setItemLabel`, then observe whether a write occurs while the role is `PLAYER`.
- Blind-review disposition 4 (direct offer-event unit cases): rejected as unnecessary. The unchanged component suite covers explicit offer toggles, missing/unreadable labels and suppression; no behavior gap was demonstrated.
- Blind-review disposition 5 (command-rejection console diagnostic): deferred as polish. The component already handles rejected command outcomes, and no user-facing gap was shown.
- Blind-review disposition 6 (live Owlbear AC5): a verification limit at review time, not a code defect. The later owner-reported live checks below satisfied AC5.

### Verification Record

- Focused `herdr-run task618-attempt2-focused --wait -- bun test src/ui/picker/`: exit 0, 49 passed, 0 failed, 81 expectations. This includes the successful-close `canPick`/`canOffer` regression and the unchanged close-rejection retry control.
- Full `herdr-run task618-attempt2-full --wait -- /Users/seigiard/.claude/artifacts/tdd-20261114-618/61.8/controls/run-full-check.sh`: exit 0. Format, lint, typecheck, unit, browser and build each exited 0. Unit: 2992 passed, 1 environment-only skip, 0 failed, 2993 tests across 108 files, 9143 expectations. Browser: 520 passed. Lint reported 169 existing warnings and 0 errors. Durable log: `/Users/seigiard/.cache/herdr-run/task618-attempt2-full.log`.
- Fresh mutation controls were run from `controls/run-reducer-mutations.py`. `early-arrival-finish`, `demotion-gm-gate`, `stale-attempt-identity`, `notification-before-close` and `close-retry-allowed` each failed their focused behavioral assertion with exit 1. Logs and git-apply-compatible patches are in `/Users/seigiard/.claude/artifacts/tdd-20261114-618/61.8/controls/`; the reducer was restored exactly (`sha256 4f32f6abd23f9937e21200fbd9b95215f507b5af7f3b5c73c853d7131dea7a61`).
- The locked `src/ui/picker/link-picker-reducer.test.ts` remained byte-identical to lock commit `9ca2d305020a3a06bf728f6242f99a0962e34fff`. Existing `src/ui/picker/link-picker.test.tsx` and `tests/link.e2e.ts` remained untouched. No live Owlbear room was used in that automated run; the owner supplied the separate live evidence below.

### Owner Live Verification and Completion

- Implementation PR #18 merged. TASK-61.8 records the owner's successful checks for an empty token label receiving the sheet name, an existing label staying unchanged, explicit replacement after checking the offer, and a repeat block supplying its own name. Each scenario included saving the token link and automatic popover closure.
- These are owner-reported live Owlbear results, not mock results or a new agent-run live check. Documentation PR #20 completed AC5 and marked TASK-61.8 Done with all five criteria checked.
- The checkbox default remains unchanged: checked for an empty readable label, unchecked for an existing label, with manual override. The stable-prop lifetime assumption and unverified intermediate role-delivery interval remain documented limits; the four checks do not prove every SDK or lifecycle behavior.
