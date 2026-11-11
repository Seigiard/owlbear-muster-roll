---
id: TASK-29
title: 5.1 Change the Preset Over Existing Sheets
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T08:45:00Z'
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
- [x] #1 **Given** sheets exist **When** Settings renders **Then** "Загрузить пресет" is enabled, and the temporary reason of Story 1.5 is gone
- [x] #2 **Given** an upload, not while `catching-up` **When** `replica` runs one `core/preset` diff over the full replica **Then** it returns removed field ids that hold a value, a key present with `false` holds a value, and a field moved across a `repeat` boundary counts as removed (AD-14) **And** the diff runs per template and sheet kind, and also returns the number of stored values to erase across all sheets, which is `{count}` **And** a field whose type changes under one id counts as removed
- [x] #3 **Given** removed fields with values **When** the diff ends **Then** one confirmation shows "Значения удалённых полей будут стёрты: {count}. Загрузить пресет?" with focus on "Отменить" (FR8, UX-DR25) **And** "Отменить" changes nothing
- [x] #4 **Given** an open confirmation **When** `catching-up` starts **Then** the confirmation closes, and nothing is written
- [x] #5 **Given** an open confirmation and a changed replica **When** the GM confirms **Then** the diff runs once more, and if the count differs the block shows the new count, focus returns to "Отменить" and a second confirmation is required **And** a new count of 0 closes the block and takes the removes-nothing path
- [x] #6 **Given** the confirmed upload, or an upload that removes nothing **When** the batch runs **Then** it writes `preset`, moves values by field id to the row that now holds them, strips removed ids and tombstones records of rows that no longer exist **And** when at least one field id of a repeat template row survives, every `rep:` record moves to the new `sectionId` with its `instanceId`, `order` and surviving values, and only removed ids are erased and counted **And** when none survive, the record is tombstoned and all its values are counted **And** the send order is new-key rows, then `preset`, then tombstones of old keys and stripped rows, so a closure at any point leaves values readable under one of the two presets **And** an upload that removes nothing shows "Формат листов изменён." under the button
- [x] #7 **Given** the new preset **When** sheets render on all clients **Then** a new field is empty, and a renamed field with the same id keeps its value (FR8) **And** every later write that mints a new `c` strips field ids absent from the template of the record's sheet kind, and values whose type differs from their field
- [x] #8 **Given** a formula that refers to a removed field **When** a client rolls it **Then** the bad formula message (Story 4.2) shows, and nothing is sent (FR7)
- [x] #9 **Given** an upload **When** it finishes **Then** the generation has not changed (AD-14)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure preset diff and migration plan in core.
2. Strip ids absent from the template on every write that mints a new c.
3. Add the diff request, the confirmed upload and the ordered batch in replica.
4. Add the confirmation UI.
5. Test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-5-1-change-the-preset-over-existing-sheets.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented (uncommitted): core/preset-migrate.ts (presetDiff, stripToTemplate); composers plan the upload in 3 groups and strip on GM patch and NPC copy; engine answers preset-diff, re-diffs on preset-upload (count-changed with count, preset-unreadable, catching-up), flushes the outbox, then applies and sends each group as its own commits; player strips pending entries silently on a preset change and strips its proposals; Settings confirmation block (usePresetUpload, PresetConfirmation). Story 1.5 lock (sheets-exist, presetLocked) removed. Tests: preset-migrate.test.ts, engine-preset.test.ts, strippedPatch tests, tests/preset-change.e2e.ts. Checks: oxfmt, lint, typecheck, bun test 1704 pass, playwright 377 pass, vite build.

All nine criteria verified on the mock room with unit, engine and Playwright tests. New strings: 'Сохранённый пресет не читается. Обновите расширение.', 'Не удалось сохранить пресет. Попробуйте ещё раз.', 'Загружать пресет может только мастер.'. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
"Загрузить пресет" works over existing sheets. A pure core diff (preset-migrate.ts) counts stored values to erase (removed ids, false, type changes, repeat-boundary moves) and plans moves: row: values go to the row that now holds them, rep: rows move to the new section with instanceId and order, the rest is stripped or tombstoned. The window asks once with the count and an erased-set digest; a changed digest asks again; zero applies at once. The engine writes and sends new-key rows, then preset, then tombstones, stopping with write-failed on a failed write. Every later write that mints c strips ids outside the template; player pending entries are re-keyed or dropped silently. Generation unchanged. Verified on the mock: lint, typecheck, 1719 unit tests, 377 Playwright tests twice, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
