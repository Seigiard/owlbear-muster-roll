---
id: TASK-42
title: Move the UI onto shadcn/ui with the React Aria base
status: To Do
assignee: []
created_date: '2026-11-11T21:56:00Z'
labels:
  - v2
dependencies:
  - TASK-41
references:
  - https://ui.shadcn.com/docs/changelog/2026-07-react-aria
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
  - src/ui/theme.ts
type: enhancement
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The extension UI uses react-aria-components (1.22.1) with four hand-made primitives in `src/ui/primitives` (button, chip, field, banner) and theme tokens `--mr-*` that `src/ui/theme.ts` fills from the live Owlbear theme. The preset builder (TASK-38) needs many more standard controls (combobox for formula completions, dialog, dropdown menu, select, tabs, toggle group, tooltip). The owner wants standard component patterns and a coherent design system instead of growing hand-made primitives one by one.

Since July 2026 shadcn/ui has React Aria as a first-class base (https://ui.shadcn.com/docs/changelog/2026-07-react-aria, `shadcn init --base aria`), so it builds on the library the project already uses. Known gaps from its component list: no Tree (the builder tree stays on RAC `Tree` with `useDragAndDrop`), no NumberField and no separate TextField (Input and Field instead). Not stated in its docs: the required react-aria-components version and the Tailwind version (its CSS uses v4 syntax; the project is on Tailwind 4).

DESIGN.md requires the window to look like part of Owlbear: dense, colours from the live Owlbear theme in both modes. shadcn defaults are roomier, so density and radii need tuning through tokens.

Start with a spike in a branch: init, version compatibility, Owlbear theme mapped onto the shadcn CSS variables, the four primitives ported, density compared with screenshots. Proceed to the migration only if the spike holds; otherwise record why and close.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A spike result records whether shadcn with the React Aria base works with the project react-aria-components version and Tailwind 4, with the evidence
- [ ] #2 The shadcn CSS variables take their values from the live Owlbear theme in dark and light mode, and the window looks the same density as before in a side-by-side screenshot
- [ ] #3 The existing primitives (button, chip, field, banner) are replaced by shadcn components, and all lint, typecheck, unit and e2e checks pass
- [ ] #4 DESIGN.md names the shadcn tokens and states which components come from shadcn and which stay custom (the builder tree)
- [ ] #5 Keyboard and focus behaviour of every replaced control is unchanged or better, checked against the EXPERIENCE.md Accessibility Floor
<!-- AC:END -->
