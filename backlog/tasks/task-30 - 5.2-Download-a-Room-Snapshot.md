---
id: TASK-30
title: 5.2 Download a Room Snapshot
status: To Do
assignee: []
created_date: '2026-11-10T15:37:00Z'
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
- [ ] #1 **Given** a loaded preset **When** the GM presses "Скачать снимок" in the Settings section "Снимок", placed between "Пресет" and "Копия в комнате" **Then** a JSON file downloads with the current `v`, every live sheet with id, kind, name and order, row values, repeat rows with instance id and order, and token links (FR13, UX-DR23) **And** the file holds no `preset`, `acl:`, `plink:`, tombstones or versions (AD-9)
- [ ] #2 **Given** no preset **When** Settings renders **Then** "Скачать снимок" and "Загрузить снимок" are disabled with "Сначала загрузите пресет." (UX-DR23)
- [ ] #3 **Given** a GM client in `catching-up` **When** Settings renders **Then** "Скачать снимок" and "Загрузить снимок" are disabled with "Загрузка…" (UX-DR30)
<!-- AC:END -->
