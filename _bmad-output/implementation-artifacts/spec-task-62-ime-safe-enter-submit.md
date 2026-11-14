---
title: 'TASK-62: keep composition confirmation separate from input commands'
type: 'bugfix'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Enter that confirms IME composition can also submit the repeat-block duplicate count, commit a builder field id rename, or insert a formula suggestion. These inputs lack the composition guard already used by the sheet field editor.

**Approach:** Ignore composing keydowns identified by `nativeEvent.isComposing` or legacy `keyCode === 229` in these three handlers. Preserve ordinary keyboard behavior. Prove the distinction through mounted inputs and run the existing duplicate and builder browser tests unchanged, together with the full repository check.

</frozen-after-approval>

## Implementation Notes

- Investigation found three local keydown handlers. No new public interface, product decision, deployment, or data change is needed.
- `src/ui/sheet/use-field-edit.ts` supplies the existing composition convention. `src/ui/sheet/duplicate-count.test.tsx` supplies the mounted React harness. Builder tests can mount the public form or use the browser harness without exporting private controls.
- Implementation runs through the delegated TDD chain. Test preparation is locked before production changes. This specification records the same scope as TASK-62.
- The duplicate count, builder field id, and formula completion keydown handlers now return before their existing actions when `nativeEvent.isComposing` is true or `keyCode` is `229`; ordinary Enter and Tab behavior remains unchanged.
- The locked mounted regression tests pass for both composition signals and their plain-key controls. The unchanged browser suite and full repository checks pass on the implementation commit.
- Verification: 11 focused tests pass; the full Bun suite reports 2931 pass, one existing environment-precondition skip, and no failure; all 519 Chromium tests pass. Format, typed lint, typecheck and production build pass. Six independent signal-arm mutations each return the corresponding regression test to red, with opposite-signal controls green.

## Review Triage Log

- Medium, deferred: composing Escape can reach the duplicate-count group's cancel handler. The group is unchanged, and the same behavior exists before this fix. Recorded in `deferred-work.md`; TASK-62 concerns Enter confirmation.
- Rejected low: additional formula ArrowUp/ArrowDown/Escape coverage. The task reports Enter/Tab insertion, and no defect in the new guard was shown.
- Rejected low: additional field-id composing Escape coverage. The first-action guard precedes the unchanged Escape branch; no regression was shown.
- Rejected low: assert `defaultPrevented` for composing keys. The guard precedes every `preventDefault` in these handlers. This is a proposed future-regression test, not a current defect.
- Code-review closeout: calibrated tests and the full check cover the finite local change. No additional revmux round or review fix was needed. Live OS input-method and Owlbear behavior were not claimed as verified.
