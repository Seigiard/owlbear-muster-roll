---
id: TASK-79
title: 'Nested repeat: blocks inside blocks'
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-18T08:14:00Z'
labels:
  - format-v4
  - blocked
dependencies:
  - TASK-78
references:
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - _bmad-output/specs/spec-muster-roll/stories.yaml
type: feature
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A repeat tab per NPC is useless unless the NPC can hold its own lists, such as attacks or items. Format v4 allows a repeat scope inside a repeat block, addressed by a path of (scope id, block id) pairs under the sheet. Story 11 of _bmad-output/specs/spec-muster-roll/stories.yaml (done checkpoint); CAP-42, CAP-30, CAP-13. Removes the temporary nesting refusal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A repeat section or row inside a repeat tab, section or row gives each block its own nested blocks, stored under a `blk:` key with more than one scope pair
- [ ] #2 A formula id resolves in its block, then each enclosing block, then the sheet; `resolveFieldReference` and formula rename follow the same chain; a formula in an attack reads `hp` of its NPC and a field of the sheet
- [ ] #3 Duplicating a block copies its nested blocks and numbers its `nameField`; the duplicate and its nested blocks have no token link
- [ ] #4 Snapshot import drops blocks whose scope path the preset lacks and counts them with the dropped values; the upload confirmation counts the values of nested blocks
- [ ] #5 Checked in a live Owlbear room by the owner: an NPC sheet with a repeat tab, an attacks section per NPC and a token cell per NPC, and a GM and a player editing different fields of one sheet at once with no edit lost
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CURRENT — window 4 closing review supersedes earlier NOT MERGED notes. Candidate 301dfcf is now merged in integration 62044f2, but NOT ACCEPTED: mixed review 6/6 reported one critical and five major owned defects. Full-path field maps still collide, preset upload undercounts descendants after parent changes, section-to-row nesting fails, ordinary repeat-row metadata regressed, nested player proposals are denied, and nested token navigation loses the parent tab. Exact findings and evidence: _bmad-output/implementation-artifacts/task-79-window4-review.md. All six checks are green (3422 unit pass/1 skip; 573 browser pass), but coverage missed these behaviors. No AC is checked; AC5 remains TASK-86 owner-only. The doubled 90-minute window budget ended before a review-fix batch. Preserve the merged work and repair the mechanism in a new authorized window.

Historical notes before window 4:

HISTORICAL STATUS — 2026-11-17, after closing review:
BLOCKED, NOT MERGED. Candidate d4fd388 on feature/preset-v4-task-79 is preserved. Invalid nested-parent paths survive snapshot import without loss accounting; the same repeat scope id under different parents is rejected globally. Resume only after TASK-78 review blockers are addressed and these two defects have faithful owners. No full nested-repeat completion is claimed.

These earlier notes are superseded by the window 4 status above.

TASK-77 review found renameFieldId updates template.repeat.nameField but not the repeated section/row nameField, and Builder withContent loses those repeat updates. Renaming the example attack field to weapon leaves nameField=attack and makes the preset invalid. Include nearest-scope nameField propagation with the existing AC2 ancestor-chain rename work, and carry it through TASK-80 Builder conversion. Source: src/core/formula-rename.ts:81-97 and src/builder/document.ts:789-812; review adversarial-claude-6.

Autonomous continuation preserved nested core/UI work on feature/preset-v4-task-79 but did not merge it. Parent reproduced a real full-path admission gap: with npc -> attack and independent loot in the preset, importing loot:l1:attack:a1 keeps its value and reports zero losses; it must drop that child and count one lost value. Reusing attack under distinct npc and boss parents is also rejected globally instead of within each parent scope. The bounded attempt is skipped pending a full-path scope resolver repair. AC5 remains owner-only under TASK-86. Evidence: preset-v4-78-87-20261117/task-79/parent-observation.md and observe-scope-paths.log in the local artifact run.

HISTORICAL: Blocked; candidate d4fd388 remains on feature/preset-v4-task-79 and is NOT merged. Two reproduced defects remain: import retains a child under an invalid parent path without counting its lost value, and repeated scope ids under different parent scopes are rejected globally. TASK-80 waits for this repair. This autonomous pass skips further repair; acceptance remains open.

Window 5 authorized by owner on 2026-11-18. Resume six owned critical/major findings and section-to-row dice lookup through one TDD review-fix batch from integration 51de85d. Budget 90 minutes from 05:24:55Z; finish mode 08:24:55Z. Cumulative review base stays 3b779818. TASK-80 and TASK-88/77 wait for repaired runtime evidence; AC5 remains owner-only.

Owner scope decision, 2026-11-18: keep ordinary visible nested editing and nested token navigation in current acceptance. Delayed child edits after parent deletion and preset replacement while nested edits are pending are optional follow-ups TASK-102 and TASK-103, not acceptance blockers or dependencies. Multiple GMs and multiple windows of one GM are outside this completion scope. Retire only the two new diagnostic tests from 3abef2f; preserve prior accepted tests and retain the diagnostic commit as evidence.

CURRENT window 5: repaired runtime is integrated at 3d0c96a. Format/lint/types/unit passed at that clean SHA (3432 pass/1 skip); browser579 and build passed at bc92efb with unchanged runtime inputs. Both review-fix batches are complete, but confirming round03 final (2/2 sources, no degradation) leaves TASK-109: opening a copied nested child from its token reveals the source on a plain tab. The real navigation reducer maps different parent paths to identical reveal state. TASK-108 is an optional constructed root/nested same-id case. The bounded two-fix loop ended blocked; no third repair or acceptance claim. TASK-86 remains owner-only. Durable record: _bmad-output/implementation-artifacts/task-79-window5-review.md.
<!-- SECTION:NOTES:END -->
