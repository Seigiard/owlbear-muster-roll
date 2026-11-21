---
id: TASK-154
title: Redesign the Builder as a three-column workspace
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-21T07:22:00Z'
updated_date: '2026-11-21T07:48:00Z'
labels:
  - builder
  - ui
dependencies: []
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the Builder (`builder.html`, `src/builder/`) the item form sits under the structure tree, so editing a selected block means scrolling the whole page down past the tree. The tree shows four permanent "+ Добавить …" rows under every row, which makes long presets hard to scan, and the top bar cards are tall. The owner supplied a reference prototype (a "Linear / Figma" style page: structure tree on the left, the preview on a dotted canvas in the center, block properties on the right, compact top bar with status pills) and chose to adopt its layout and look only. New functions from that prototype (tree search, a JSON mode, per-block JSON, duplicate block) are out of scope and may become separate tasks. The preview window keeps rendering with the app themes from `src/ui/themes.ts`; only the Builder chrome around it changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 At desktop widths (1280px and wider) the Builder shows three columns side by side: structure tree, preview, block properties; each column scrolls on its own and the page itself does not scroll
- [ ] #2 The properties column shows the selected block form at all times without scrolling past the tree
- [ ] #3 Tree rows show a muted type icon and secondary details (field type, formula) in muted text; a container shows its add items only when it or one of its direct children is selected, and the two top-level template add items always show
- [ ] #4 The preview sits centered on a canvas with a size label (for example 600 × 600); the Мастер / Игрок switch sits in the preview toolbar; a large custom window scales down to the canvas width keeping its proportions
- [ ] #5 The top bar is one compact row: draft status, undo/redo, problem count and the Пресет / Снимок cards keep every current action and status
- [ ] #6 Down to 1000px wide the layout stays usable without horizontal page scroll
- [ ] #7 Existing behavior is unchanged: attached files and conflicts, problem navigation, keyboard treegrid navigation, drag reordering, record editing in the preview, light and dark themes; existing unit and browser tests pass, updated only where they assert old layout or the add-items rule
- [ ] #8 Interface text stays in `src/copy.ts`; colours come from the Owlbear theme tokens
- [ ] #9 DESIGN.md and EXPERIENCE.md Preset builder sections describe the three-column layout, tree icons and add-items rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Follow _bmad-output/implementation-artifacts/spec-task-154-builder-three-column.md (approved 2026-11-21): 1. Full-height three-pane shell in builder-page.tsx. 2. Compact TopBar and one-line FileBlock chips. 3. Structure tree: type icons, muted details, contextual add items. 4. Preview toolbar and canvas. 5. Item form as right pane. 6. e2e updates and a layout test. 7. DESIGN.md and EXPERIENCE.md.
<!-- SECTION:PLAN:END -->
