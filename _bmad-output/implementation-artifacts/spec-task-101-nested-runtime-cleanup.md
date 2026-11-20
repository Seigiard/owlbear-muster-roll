---
title: 'TASK-101: Remove unused nested runtime work'
type: 'refactor'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '2694576b7b7324bef39a4997a49af3d7e91f4789'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Preset migration still carries code for moving a repeat block to a different address, although a surviving repeat scope keeps its id and full path. The comment on `formulaFieldLookup` omits the enclosing blocks that can own a referenced field.

**Approach:** Remove the unreachable relocation branches from `presetDiff` and the unused inputs to `sectionTarget`. Keep the order of migration writes, in-place field clearing, block and token-link removal, and new single-sheet creation. Document field resolution in the order own block (`ownBlock`), enclosing blocks from nearest outward (`blockAt` with the owning scope path), then the same sheet (`sheetRow`). Do not change formula evaluation or token-link validation. Use existing behavior checks. Do not add tests for source shape or absence.

</frozen-after-approval>

## Implementation Notes

- `presetDiff` clears retained blocks in place. New single sheets still get a new lifetime version through `PlannedWrite.relocate`.
- `presetMoves` keeps its existing two-argument call shape for the Builder and pending edits. It no longer collects scopes from the old template.
- Node 22.19.0 ran all 588 browser tests without the Node 26 crash tracked in TASK-144. No tests changed.

## Review Triage Log

- Both reviewers reported. No finding applied to the change.
- Deferred TASK-145 and TASK-146. The sheet-scope field lookup and preset retry defects are present before this change. The verification reproduced both outside the task's source changes.
