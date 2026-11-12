---
id: TASK-42
title: Move the UI onto shadcn/ui with the React Aria base
status: Done
assignee:
  - '@claude'
created_date: '2026-11-11T21:56:00Z'
updated_date: '2026-11-12T01:49:00Z'
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
- [x] #1 A spike result records whether shadcn with the React Aria base works with the project react-aria-components version and Tailwind 4, with the evidence
- [x] #2 Theme fallbacks in src/preview/themes.ts, the mock platform, tests/support/colors.ts and DESIGN.md hex values are the live Owlbear values, so the preview and e2e tests show the colours players see
- [x] #3 In the light theme, accent text on the surface and text on the accent reach 4.5:1, raised through color-mix from the Owlbear theme colours rather than new fixed hex values or other theme fields
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
PART A (to master): 1. AC6: put the live Owlbear theme values into the mock theme, the preview themes, tests/support/colors.ts and DESIGN.md; update the e2e colour expectations and the build leak check. 2. AC7: in light mode map --mr-accent and --mr-focus to color-mix(in srgb, primary.main 65%, text.primary); prove the ratios with an e2e test that composites the tokens in Chromium. 3. Full check, focused commits on 0e64ed6.
PART B (separate branch, not merged): 1. Spike shadcn init --base aria on Tailwind 4 / React 19 / Vite; map shadcn CSS variables onto --mr-* tokens; port button, chip, field, banner plus a dialog/menu/tab slice. 2. Judge bundle size, a11y parity (e2e), code weight. 3. Migrate the rest only if the spike holds. 4. Review, full check, commit. Record the verdict in the notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PART A (commits 686c3ca, 2990dd6 on 0e64ed6, for master).
AC6: the mock theme (src/platform/mock/index.ts), src/preview/themes.ts (preview and builder), tests/support/colors.ts LIGHT_THEME and the DESIGN.md front matter now hold the live Owlbear values from comment #1. DESIGN.md hex values are the dark theme; the colour-mix tokens were read from Chromium (surface-tab #383C4D, stripe #222638, line #4E5161, line-strong #91939C); text-muted #FFFFFFB3 and accent-contrast #000000DE keep Owlbear's alpha. The test colour helpers paint over the window surface, because Owlbear text colours carry alpha. The build leak check lists the new hexes (white left out: Tailwind's ring offset ships #fff).
AC7: light mode maps --mr-accent and --mr-focus to color-mix(in srgb, primary.main 65%, text.primary) (src/ui/theme.ts); dark keeps primary.main. Evidence: tests/window.e2e.ts 'the light theme gives text 4.5:1 and the focus outline 3:1 on every surface' composites the tokens in Chromium. Before (same test with 100%): accent on surface 3.32, on surface-bar 2.82, on surface-tab 2.74, on stripe 3.29; white on accent 3.68; focus on bar 2.82. After: accent on surface 5.55, bar 4.77, tab 4.64, stripe 5.49; white on accent 6.16; focus 4.64 or more. Dark unchanged: accent 6.49 on surface, 4.74 on tab; contrast text on accent 7.85.
Full check on 2990dd6: oxfmt clean, lint 0 errors, typecheck clean, bun test 2557 pass, test:browser 466 pass, build ok.

2026-11-12: the owner closed the shadcn move after the spike verdict. The spike branch is kept as spike/task-42-shadcn (not merged). The migration criteria (shadcn variables, primitives replaced, DESIGN.md naming, keyboard parity) are dropped with that decision.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-11T22:08:00Z

---

Live Owlbear theme values, read from the extension root style in a live room on 2026-11-11.
Dark: background.paper #222639, background.default #1e2231, text.primary #fff, text.secondary rgba(255, 255, 255, 0.7), primary.main #bb99ff, primary.contrastText rgba(0, 0, 0, 0.87).
Light: background.paper #f1f3f9, background.default #dde1ee, text.primary rgba(0, 0, 0, 0.87), text.secondary rgba(0, 0, 0, 0.6), primary.main #9966ff, primary.contrastText #fff.
Current fallbacks differ: dark is grey with a gold accent (#333333, #D9B36C), light has a blue accent (#0055AA).
Contrast with the live values: light accent on surface 3.3:1 (section headings, dice button labels), light white text on the accent button 3.7:1; the dark theme passes every check. Owner decision: raise the light accent contrast with color-mix from the theme colours, not by taking primary.dark.
Report (expires 2026-12-09): https://reports.1218217.xyz/reports/owlbear-muster-roll/20261111T220407Z-3a9ee538/index.html

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Part A landed on master (b67d996): the mock, preview, test colours and DESIGN.md use the live Owlbear theme values, and the light accent and focus colour are color-mix(primary 65%, text.primary), lifting accent on surface from 3.32 to 5.55:1 and white on accent from 3.68 to 6.16:1, with an e2e test that computes the ratios. Part B, the shadcn/ui React Aria spike, works on the project stack (shadcn 4.23.0, RAC 1.22.1, Tailwind 4) but cost +16.3% gzip on the window chunk, broke 8 e2e tests through its defaults and added more wrapper code than it replaced, with no visible gain; the verdict is in _bmad-output/implementation-artifacts/spec-task-42-shadcn-aria.md. The owner chose to keep growing the RAC primitives instead; the spike branch spike/task-42-shadcn is kept unmerged for reference.
<!-- SECTION:FINAL_SUMMARY:END -->
