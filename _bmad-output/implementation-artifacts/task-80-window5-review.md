# TASK-80 window 5 result

## State

Builder candidate `517e8082849d8c1583d0c27fd383472c8f997297` is preserved,
unmerged and not accepted, on `feature/preset-v4-task-80-w4`.
Its worktree is `task80-builder-w4-20261117`.
The candidate includes the repaired runtime through `3d0c96a`.

The candidate spec still says ready-for-dev. This record and TASK-80 supersede
that stale status. Continue from the existing implementation; do not build it
again. No acceptance criterion is checked.

## Verification

- Full format, lint, unit, browser and build passed at clean `67effe2`.
- Unit: 3441 pass, one environment skip. Browser: 579 pass.
- Typecheck found an initializer in an overload declaration.
- `517e808` mechanically changes that declaration to an optional parameter.
  The parent compared emitted JavaScript before and after; it is identical.
- Corrected typecheck, format and lint passed at clean `517e808`.
  Focused Builder tests passed38/38.
- Three faithful mutations failed at protected assertions for form updates,
  scoped id suggestions and loaded-file warnings. The parent read raw evidence.

## Review

`01-initial` stopped when Claude API credit ran out. `02-after-fix` was
interrupted for the owner's requested retry through subscription.
`03-after-fix` completed with profile mixed, six of six sources and no
degradation. This was the first complete Builder review, not a fix confirmation.
The fixed review base is `3d0c96a`.

The five confirmed major findings remain within TASK-80:

1. Generated repeat ids miss competing ids in the same parent scope.
2. Enabling repeat on a tab defaults to `name` even when its text field differs.
3. Template name-field choices include fields owned by repeat tabs.
4. Loaded-file warnings use positions, so moving/removing a preceding node
   can hide the required warning or show it for another node.
5. Changing a loaded repeat template's identity gives no warning.

A separate pre-existing major also remains owned by TASK-80 AC2:
field rename loses the updated tab/section/row nameField during Builder
conversion. It was already carried into this task before the current review.

Two test-only findings belong to the corresponding name-field and warning
repairs. The stale spec status is a minor documentation finding.
Repeated form markup and a whole-document conversion were judged immaterial.

No repair batch started before the window limit. These are required remaining
work, not optional additions. Runtime TASK-109 and owner-only TASK-86 remain
separate prerequisites; TASK-88 and TASK-77 AC2 remain open.
