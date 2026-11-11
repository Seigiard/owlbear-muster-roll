---
id: TASK-23
title: 3.4 See When an Edit Is Waiting for a GM
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T07:29:00Z'
labels:
  - epic-3
milestone: m-2
dependencies:
  - TASK-22
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
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player with access, I want to see that my edit has not applied yet, So that I know whether the sheet is current.

Story 3.4 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a player types a change **When** the field updates **Then** the typed value shows at once (UX-DR28) **And** the "Ожидает" mark in `label-sm` on the warning pair appears after a short delay with no answer, or at once with no GM (UX-DR3)
- [x] #2 **Given** no GM client responds **When** a player edits **Then** the edit does not apply to any client, the no-GM banner shows, the sheets stay readable and the edit stays visible (FR15, UX-DR29) **And** the entry is resent with backoff
- [x] #3 **Given** a pending edit **When** a GM client responds and commits **Then** the mark disappears with no message and no player action (FR15, UX-DR29)
- [x] #4 **Given** a pending new repeat row or removed repeat row **When** the section renders **Then** the new row carries the mark, and the removed row stays dimmed with the mark and has its inputs disabled (UX-DR28)
- [x] #5 **Given** the GM revokes access during an edit **When** the player's client receives the change **Then** the field returns to read-only and the edit is dropped, with "Нет прав на правку" (UX-DR29)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Expose per-key pending state in the projection.
2. Show the "Ожидает" mark after 1000 ms, or at once with no GM; dim removed rows.
3. Drop pending entries on acl: revocation.
4. Test with unit, engine and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-3-4-see-when-an-edit-is-waiting-for-a-gm.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-3-4: $pending in the projection store (add/edit/remove + changed fields), window-side pending-marks timer (TIMING.pendingMarkDelayMs = 1000, at once when gmLink offline), field and row marks with aria-describedby, removed rows dimmed with disabled inputs and no Удалить, engine drops a sheet's entries on its own acl: tombstone with one notification. Tests: projection-store, pending-marks, engine-propose (revoke), tests/pending.e2e.ts (9 scenarios, mutation-checked). All verification commands pass.

All five criteria verified on the mock room with unit, engine and Playwright tests. Mark delay 1000 ms per field or row; at once with no GM after the first catch-up. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A player's waiting edit shows its typed value at once and the "Ожидает" mark (label-sm, warning pair, in the field's accessible description) after 1000 ms with no answer, or at once with no GM. The delay is per changed field or row. A new repeat row carries the mark; a removed row stays dimmed with the mark, its inputs and dice button disabled, focus moved to "Добавить строку", announced once. A commit clears the mark with no message. After each batch the engine drops entries the replica no longer allows (revoked acl:, deleted sheet, removed row) with one "Нет прав на правку". Verified on the mock: lint, typecheck, 1656 unit tests, 369 Playwright tests twice, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
