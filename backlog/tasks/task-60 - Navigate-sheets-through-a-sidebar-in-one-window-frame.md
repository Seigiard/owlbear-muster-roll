---
id: TASK-60
title: Navigate sheets through a sidebar in one window frame
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-12T18:50:00Z'
labels:
  - v3
dependencies:
  - TASK-59
type: feature
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With tabs inside a sheet, a second horizontal tab bar of sheets is confusing, and the frame (sheet bar, banner, content) is rebuilt by hand in WindowShell, preview-page.tsx and the builder preview-pane.tsx. The owner chose a sidebar from his sketch: sheet sets as titled groups, single sheets as plain entries, Settings at the bottom. Story 3 of _bmad-output/specs/spec-muster-roll/stories.yaml; binding rule AD-26; layout in EXPERIENCE.md and DESIGN.md; visual reference ux-designs/ux-owlbear-muster-roll-2026-11-10/mockups/window-sidebar-tabs.html.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The window shows a 10 rem sidebar: each sheet set a group with its title heading, its sheets (a player own sheets first, marked вы) and + Добавить for the GM, then a divider; each single sheet a plain entry; Settings pinned at the bottom for the GM
- [ ] #2 A long sheet name is cut short and shows in full in a tooltip; the list scrolls and Settings stays in place
- [ ] #3 Selection marks show on sidebar entries and tabs, and the window never switches sheet or tab for a selection
- [ ] #4 The window, preview.html and the builder preview draw through one frame component; no other module lays out the sidebar, tab row and content area
- [ ] #5 Up and Down move across sidebar entries; group headings are outside the tab list and named by aria-describedby; + Добавить is reached by Tab
- [ ] #6 GLOSSARY.md replaces the old sheet tab meaning with Sidebar and Sidebar entry
<!-- AC:END -->
