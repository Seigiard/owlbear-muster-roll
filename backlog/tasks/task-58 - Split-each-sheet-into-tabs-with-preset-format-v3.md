---
id: TASK-58
title: Split each sheet into tabs with preset format v3
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T18:50:00Z'
updated_date: '2026-11-12T19:34:00Z'
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
- [x] #1 A preset is v3: every template has a required non-empty tabs list of { title?, visibility?, sections }, strict; a tab title may be omitted only when the template has one tab; v1 and v2 presets, snapshots and room data are refused with the existing messages
- [x] #2 The window sheet shows the header, then a row of its tabs, then the sections of the open tab; a template with one tab shows no tab row; the open tab is client-local and falls back to the first tab
- [x] #3 A formula on one tab rolls with a field from another tab of the same template, and values keep their keys when sections or rows move between tabs
- [x] #4 A token that opens a repeat block opens the sheet on the tab that holds it
- [x] #5 preview.html frames and the builder preview let the author switch tabs; the builder tree has a tab level with Добавить вкладку, a tab form with title and visibility, drag of tabs and of sections between tabs, and problems placed at the tab
- [x] #6 window.width accepts 480 to 1440 px
- [x] #7 docs/preset-format.md, the spec copy preset-format.md, docs/example-preset.json, presets/*.json and test fixtures use v3; the example parse test passes; GLOSSARY.md defines Tab
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Spec: _bmad-output/implementation-artifacts/spec-task-58-tabs-format-v3.md. 1. core: v3 schema with tabs, layoutSections/sectionAt helpers, address with tab index, problems, untitled-tab failure, window min 480. 2. replica compiles through helpers. 3. ui: tab row, client-local open tab, token reveal selects tab. 4. preview frames switch tabs. 5. builder: tab node, form, drag, add, preview tab. 6. fixtures, presets, tests to v3 plus new tests. 7. docs and GLOSSARY.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: preset.test.ts (tabs, untitled-tab, cross-tab ids and formulas, width 479/480), snapshot/engine tests refuse v1 and v2, preset-migrate.test.ts (move section between tabs keeps keys, removed tab counted), dice-roll.test.ts cross-tab field, formula-rename and document tests across tabs, tests/tabs.e2e.ts (tab switch kept across sheets, one tab no row, arrows, cross-tab roll, token opens tab 2 scrolled to block), builder.e2e.ts multi-tab flow, preview.e2e.ts frame tab switch. Full check: format, lint, typecheck, build clean; bun test 2720 pass, 1 fail (copy catalog "+ Добавить", red since 6c8785b, deferred to TASK-60); test:browser 499 pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preset format v3: every template holds tabs: [{ title?, visibility?, sections }]; v1 and v2 data are refused (mr3 keys). The window sheet, preview.html frames and the builder preview show a tab row under the sheet header; the open tab is client-local per sheet, and a token opening a repeat block selects its tab. Cell addresses carry the tab (roll place, data-cell, problem paths); field scopes, migrate diffs and token links read all tabs, so record keys did not change. Builder: tab node, Добавить вкладку, tab form (title, visibility), drags between tabs, untitled-tab problem. window.width min 480. Docs, example preset, fixtures and GLOSSARY (Tab) updated. Tab visibility hides nothing yet (TASK-59). Waits for the owner live-room check before Done.
<!-- SECTION:FINAL_SUMMARY:END -->
