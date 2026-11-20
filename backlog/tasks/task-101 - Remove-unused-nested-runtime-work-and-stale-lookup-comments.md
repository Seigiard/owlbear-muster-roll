---
id: TASK-101
title: Remove unused nested-runtime work and stale lookup comments
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-17T23:10:00Z'
updated_date: '2026-11-20T07:43:00Z'
labels:
  - format-v4
  - review-follow-up
dependencies: []
references:
  - TASK-79
  - src/core/link-target.ts
  - src/core/preset-migrate.ts
  - src/core/formula-evaluate.ts
  - _bmad-output/implementation-artifacts/task-79-window4-review.md
priority: low
type: chore
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Window-4 review of 62044f2 found maintenance work outside the TASK-79 behavior repair: liveLinkTarget builds a default block index and discards it; sectionTarget ignores parameters; presetDiff retains unreachable relocation state because stable ids never relocate; formula lookup comments omit enclosing blocks and blockAt. Findings arch+quality-claude-6, lean-codex-3 and docs+tests-codex-4. Reassess after the blocking full-path fixes, which may change these mechanisms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Token-link validation performs no unused whole-room index construction while retaining its current visible-target checks.
- [x] #2 Migration contains only reachable behavior required by the stable repeat-id contract; unused parameters and state are removed or justified by a live consumer.
- [x] #3 Formula lookup comments describe own block, enclosing blocks and sheet in their actual order, including the parent-value source.
- [x] #4 Existing affected behavior checks pass without adding source-shape or absence tests for this cleanup.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Recheck the 2026-11-20 findings on master after TASK-108 and TASK-100.
2. Remove the unreachable migration relocation path and unused helper inputs. Keep in-place block writes, new single-sheet creation, and current write ordering.
3. Document formula lookup precedence and verify the existing behavior checks without new tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validity check 2026-11-20 at 34131dc: AC#1 is already met. liveLinkTarget (src/core/link-target.ts:130) builds no default block index; it resolves the sheet, checks the block is live and reads the repeat section by scope path. AC#2 still open: sectionTarget keeps 'void fields; void allowTextForSelect' and presetDiff's relocatedSources/relocatedTargets are unreachable because sectionTarget returns the same id or null, so target === source.k always. AC#3 still open: the formulaFieldLookup comment (src/core/formula-evaluate.ts:346-349) names own block then sheet scope and omits enclosing blocks and blockAt.

Rechecked origin/master at 2694576b7b7324bef39a4997a49af3d7e91f4789. AC#1 still holds: liveLinkTarget checks the stored block and resolves the full scope path without a room-wide index. AC#2 remains open: repeatScopeTarget returns the original final scope id or null, and reconstructing the key with the original parent and block id yields the original key. sectionTarget still discards both extra arguments. AC#3 remains open: TASK-100 fixed blockValuesFor to match the full scope path but did not update the comment. Existing preset migration, formula evaluation, and token-link baseline tests: 143 pass, 0 fail.

Verification on 953406ff362f1d5ccec8dd6407671a2c88dbfc97: whole-tree format, lint, typecheck, build, and formal drift passed; 3,666 unit tests passed, 1 skipped, 0 failed; all 588 Chromium tests passed under Node 22.19.0 with four workers; 55/55 mutants were killed, with no stale mutants. No tests changed. Both focused review sources responded with no findings in the diff. Two pre-existing findings were reproduced and recorded separately as TASK-145 and TASK-146.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the unreachable repeat-block relocation code from preset migration, including the unused sectionTarget helper and relocation state. Existing writes keep their order and block keys. The formula lookup comment now explains own-block, enclosing-block and same-sheet lookup, including the blockAt value source. Token-link validation and runtime formula behavior are unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
