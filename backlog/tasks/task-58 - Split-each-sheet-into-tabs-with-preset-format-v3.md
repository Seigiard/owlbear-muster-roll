---
id: TASK-58
title: Split each sheet into tabs with preset format v3
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T18:50:00Z'
updated_date: '2026-11-12T18:50:00Z'
labels:
  - v3
dependencies: []
references:
  - _bmad-output/specs/spec-muster-roll/stories.yaml
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - >-
    _bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
type: feature
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A long sheet does not fit one window, and a GM wants a part of a visible sheet, such as GM notes, on its own page. The owner decided (forge session sidebar-tabs-layout, 2026-11-12) that every template holds a required list of tabs and a sheet shows one tab at a time. The change removes Template.sections, so the preset, the window sheet, preview.html and the builder change together. There are no live users yet, so v1 and v2 data are refused, with no migration. Story 1 of _bmad-output/specs/spec-muster-roll/stories.yaml; binding rules in the architecture spine AD-11, AD-12, AD-14, AD-18 "Rule, tabs", AD-21 to AD-25 and AD-26 "Rule, open tab". Hiding tabs is TASK-59 and the sidebar is TASK-60: accept the tab visibility key here without hiding anything, and keep the current sheet tab bar.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A preset is v3: every template has a required non-empty tabs list of { title?, visibility?, sections }, strict; a tab title may be omitted only when the template has one tab; v1 and v2 presets, snapshots and room data are refused with the existing messages
- [ ] #2 The window sheet shows the header, then a row of its tabs, then the sections of the open tab; a template with one tab shows no tab row; the open tab is client-local and falls back to the first tab
- [ ] #3 A formula on one tab rolls with a field from another tab of the same template, and values keep their keys when sections or rows move between tabs
- [ ] #4 A token that opens a repeat block opens the sheet on the tab that holds it
- [ ] #5 preview.html frames and the builder preview let the author switch tabs; the builder tree has a tab level with Добавить вкладку, a tab form with title and visibility, drag of tabs and of sections between tabs, and problems placed at the tab
- [ ] #6 window.width accepts 480 to 1440 px
- [ ] #7 docs/preset-format.md, the spec copy preset-format.md, docs/example-preset.json, presets/*.json and test fixtures use v3; the example parse test passes; GLOSSARY.md defines Tab
<!-- AC:END -->
