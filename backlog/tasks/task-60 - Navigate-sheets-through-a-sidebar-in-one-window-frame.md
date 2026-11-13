---
id: TASK-60
title: Navigate sheets through a sidebar in one window frame
status: Done
assignee:
  - '@claude'
created_date: '2026-11-12T18:50:00Z'
updated_date: '2026-11-13T05:53:00Z'
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
- [x] #1 The window shows a 10 rem sidebar: each sheet set a group with its title heading, its sheets (a player own sheets first, marked вы) and + Добавить for the GM, then a divider; each single sheet a plain entry; Settings pinned at the bottom for the GM
- [x] #2 A long sheet name is cut short and shows in full in a tooltip; the list scrolls and Settings stays in place
- [x] #3 Selection marks show on sidebar entries and tabs, and the window never switches sheet or tab for a selection
- [x] #4 The window, preview.html and the builder preview draw through one frame component; no other module lays out the sidebar, tab row and content area
- [x] #5 Up and Down move across sidebar entries; group headings are outside the tab list and named by aria-describedby; + Добавить is reached by Tab
- [x] #6 GLOSSARY.md replaces the old sheet tab meaning with Sidebar and Sidebar entry
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/ui/copy.test.ts "Add a sheet of a sheet set" is red since the UX update (6c8785b): EXPERIENCE.md asks for "+ Добавить", copy.addSign is still "+". The sidebar change sets it; update the "+" assertions in tests/characters.e2e.ts with it.

Built through the tdd chain (run dir ~/.claude/artifacts/tdd-20261113-013528/TASK-60) and three revmux review rounds (owlbear-task-60: 01-initial 1 critical, 4 major, 15 minor; 02-after-fix 1 major; 03-after-fix 0). Review fixes: sheet content remounts per sheet so a field draft saves to its own sheet; Settings is one sidebar tab entry with no toggle or second button; WindowFrame lays out header, tab row, content in that order; on a multi-tab sheet the column scrolls so a tall access panel stays reachable; spacing utilities outside the theme scale (min-w-0, min-h-0, h-10, gap-0.5) replaced, since the theme reset makes them emit no CSS. 23 legacy e2e tests of the horizontal bar were rewritten or retired with named new owners. Deferred items are in _bmad-output/implementation-artifacts/deferred-work.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The window now navigates sheets through a 10 rem sidebar instead of the horizontal sheet bar. One WindowFrame in src/ui/shell draws the sidebar, banner, sheet header, tab row and content for the room window, preview.html and the builder preview; src/ui/shell/sidebar-entries.ts (replacing ui/sheet-tabs.ts) groups and orders entries from core/visibility, core/sheets and core/access. Sheet sets are groups with a heading outside the tab list (aria-describedby), the player's own sheets first and marked «вы», «+ Добавить» for the GM as a Tab-stop button; single sheets are plain entries; Settings is pinned at the bottom for the GM. Long names truncate with a full tooltip, the list scrolls under a fixed Settings, Up/Down move across groups, and selection marks show on entries and tabs without switching either. GLOSSARY defines Sidebar and Sidebar entry; copy.addSign is «+ Добавить», so the copy catalog baseline is green. Verification on the final tree: oxfmt, lint, typecheck, build exit 0; bun test 2736 pass, 0 fail; bun run test:browser 512 passed. Risks and follow-ups: behavior in a live Owlbear room needs the owner's check; deferred review items (tooltip lock, preview sync XHR, two test-only gaps, RTL shadow) are in deferred-work.md.
<!-- SECTION:FINAL_SUMMARY:END -->
