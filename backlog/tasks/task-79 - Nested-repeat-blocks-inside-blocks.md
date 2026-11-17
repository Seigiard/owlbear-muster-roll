---
id: TASK-79
title: 'Nested repeat: blocks inside blocks'
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-16T06:49:00Z'
updated_date: '2026-11-17T06:37:00Z'
labels:
  - format-v4
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
TASK-77 review found renameFieldId updates template.repeat.nameField but not the repeated section/row nameField, and Builder withContent loses those repeat updates. Renaming the example attack field to weapon leaves nameField=attack and makes the preset invalid. Include nearest-scope nameField propagation with the existing AC2 ancestor-chain rename work, and carry it through TASK-80 Builder conversion. Source: src/core/formula-rename.ts:81-97 and src/builder/document.ts:789-812; review adversarial-claude-6.

Autonomous continuation preserved nested core/UI work on feature/preset-v4-task-79 but did not merge it. Parent reproduced a real full-path admission gap: with npc -> attack and independent loot in the preset, importing loot:l1:attack:a1 keeps its value and reports zero losses; it must drop that child and count one lost value. Reusing attack under distinct npc and boss parents is also rejected globally instead of within each parent scope. The bounded attempt is skipped pending a full-path scope resolver repair. AC5 remains owner-only under TASK-86. Evidence: preset-v4-78-87-20261117/task-79/parent-observation.md and observe-scope-paths.log in the local artifact run.
<!-- SECTION:NOTES:END -->
