---
id: TASK-30
title: 5.2 Download a Room Snapshot
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-11T09:06:00Z'
labels:
  - epic-5
milestone: m-4
dependencies:
  - TASK-29
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
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want to download the room's data as a file, So that I have a copy outside my browser.

Story 5.2 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a loaded preset **When** the GM presses "Скачать снимок" in the Settings section "Снимок", placed between "Пресет" and "Копия в комнате" **Then** a JSON file downloads with the current `v`, every live sheet with id, kind, name and order, row values, repeat rows with instance id and order, and token links (FR13, UX-DR23) **And** the file holds no `preset`, `acl:`, `plink:`, tombstones or versions (AD-9)
- [x] #2 **Given** no preset **When** Settings renders **Then** "Скачать снимок" and "Загрузить снимок" are disabled with "Сначала загрузите пресет." (UX-DR23)
- [x] #3 **Given** a GM client in `catching-up` **When** Settings renders **Then** "Скачать снимок" and "Загрузить снимок" are disabled with "Загрузка…" (UX-DR30)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the snapshot file schema and encoder in core.
2. Add the Снимок section with Скачать снимок and the disabled states.
3. Test with unit and Playwright tests.
Spec: _bmad-output/implementation-artifacts/spec-5-2-download-a-room-snapshot.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented core/snapshot-file.ts (schema, encoder, formatter, file name), the Settings 'Снимок' section with 'Скачать снимок' and a disabled 'Загрузить снимок' placeholder, unit tests (src/core/snapshot-file.test.ts) and e2e tests (tests/snapshot.e2e.ts, plus one catch-up test in tests/catch-up.e2e.ts). Details are in the spec's Implementation Notes.

All three criteria verified on the mock room with unit and Playwright tests. Records now refuse the key segment __proto__. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Settings has a "Снимок" section between "Пресет" and "Копия в комнате". "Скачать снимок" downloads muster-roll-snapshot-YYYY-MM-DD.json: { v, type: 'muster-roll/snapshot', sheets [{ id, kind, name, order, rows, repeats }], links }, built by core/snapshot-file.ts from live records only (no preset, acl:, plink:, tombstones or versions), sorted so equal data gives equal bytes. The zod schema refuses duplicates, dangling links and __proto__ ids. With no preset or during catch-up both snapshot buttons are disabled with the reason. Verified on the mock: lint, typecheck, 1758 unit tests, 382 Playwright tests twice, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
