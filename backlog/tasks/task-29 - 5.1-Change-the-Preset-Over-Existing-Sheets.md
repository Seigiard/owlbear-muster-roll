---
id: TASK-29
title: 5.1 Change the Preset Over Existing Sheets
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
labels:
  - epic-5
milestone: m-4
dependencies:
  - TASK-23
  - TASK-28
references:
  - _bmad-output/planning-artifacts/epics.md
documentation:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - >-
    _bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
type: feature
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to upload a changed preset after sheets exist, So that the format can grow during a campaign.

Story 5.1 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **Given** sheets exist **When** Settings renders **Then** "Загрузить пресет" is enabled, and the temporary reason of Story 1.5 is gone
- [ ] #2 **Given** an upload, not while `catching-up` **When** `replica` runs one `core/preset` diff over the full replica **Then** it returns removed field ids that hold a value, a key present with `false` holds a value, and a field moved across a `repeat` boundary counts as removed (AD-14) **And** the diff runs per template and sheet kind, and also returns the number of stored values to erase across all sheets, which is `{count}` **And** a field whose type changes under one id counts as removed
- [ ] #3 **Given** removed fields with values **When** the diff ends **Then** one confirmation shows "Значения удалённых полей будут стёрты: {count}. Загрузить пресет?" with focus on "Отменить" (FR8, UX-DR25) **And** "Отменить" changes nothing
- [ ] #4 **Given** an open confirmation **When** `catching-up` starts **Then** the confirmation closes, and nothing is written
- [ ] #5 **Given** an open confirmation and a changed replica **When** the GM confirms **Then** the diff runs once more, and if the count differs the block shows the new count, focus returns to "Отменить" and a second confirmation is required **And** a new count of 0 closes the block and takes the removes-nothing path
- [ ] #6 **Given** the confirmed upload, or an upload that removes nothing **When** the batch runs **Then** it writes `preset`, moves values by field id to the row that now holds them, strips removed ids and tombstones records of rows that no longer exist **And** when at least one field id of a repeat template row survives, every `rep:` record moves to the new `sectionId` with its `instanceId`, `order` and surviving values, and only removed ids are erased and counted **And** when none survive, the record is tombstoned and all its values are counted **And** the send order is new-key rows, then `preset`, then tombstones of old keys and stripped rows, so a closure at any point leaves values readable under one of the two presets **And** an upload that removes nothing shows "Формат листов изменён." under the button
- [ ] #7 **Given** the new preset **When** sheets render on all clients **Then** a new field is empty, and a renamed field with the same id keeps its value (FR8) **And** every later write that mints a new `c` strips field ids absent from the template of the record's sheet kind, and values whose type differs from their field
- [ ] #8 **Given** a formula that refers to a removed field **When** a client rolls it **Then** the bad formula message (Story 4.2) shows, and nothing is sent (FR7)
- [ ] #9 **Given** an upload **When** it finishes **Then** the generation has not changed (AD-14)
<!-- AC:END -->
