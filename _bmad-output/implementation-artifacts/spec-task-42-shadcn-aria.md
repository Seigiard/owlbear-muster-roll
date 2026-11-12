---
title: 'TASK-42 PART B Spike and Move the UI onto shadcn/ui with the React Aria Base'
type: 'refactor'
created: '2026-11-12'
status: 'done'
baseline_commit: 'e318b16e45bee44c5f7a9acf2eba32525a80bd0f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The UI grows hand-made primitives one by one (`src/ui/primitives`: button, chip, field, banner), and the preset builder needs many more standard controls. The owner wants standard component patterns and one design system. shadcn/ui ships a React Aria base since July 2026, on the library the project already uses. Backlog TASK-42 AC1–AC5; AC6 and AC7 are done on master (PART A).

**Approach:** Spike first on this branch: `shadcn init --base aria` in the repo, the shadcn CSS variables fed from the `--mr-*` tokens, and a representative slice ported (the four primitives, a menu, tabs). Judge it on bundle size, accessibility parity (every e2e stays green) and code weight. Migrate the rest of the UI only if the spike holds; otherwise record why and stop.

## Boundaries & Constraints

**Always:**
- Owner instructions: the branch is not merged to master and not deployed; the owner reviews it. DESIGN.md and architecture changes stay on this branch.
- Colours come from the live Owlbear theme through `src/ui/theme.ts`; shadcn variables are aliases of `--mr-*` tokens, in both modes.
- EXPERIENCE.md Accessibility Floor holds for every replaced control: a 2 px solid focus outline in `{colors.focus}`, 32 px touch targets, react-aria keyboard behaviour, text contrast 4.5:1.
- DESIGN.md density, radii, system font and Russian copy in `src/ui/copy.ts` stay.
- The builder tree stays on react-aria-components `Tree` (AD-25); NumberField-like and text inputs keep RAC where shadcn has no part.

**Never:**
- No modal dialog replaces the inline confirmation block (EXPERIENCE.md Confirmation), and no other behaviour change rides along.
- No new web font, no default Tailwind colour palette, no `eval`.
- No migration past the spike if the spike does not hold.

</frozen-after-approval>

## Code Map

- `src/ui/primitives/{button,chip,field,banner}.tsx` -- hand-made primitives on RAC; `Pressable` carries the disabled-reason contract (a disabled control always names its reason)
- `src/ui/main.css` -- Tailwind `@theme static` with `--*: initial`: only DESIGN.md tokens exist; `tests/build.test.ts` asserts no default scale (`p-5`, `text-xl`, `font-bold`, `shadow-md`, `rounded-xl`) generates
- `src/ui/theme.ts` -- `themeTokens` fills `--mr-*`; `data-theme-mode` on the root carries the mode
- `src/ui/shell/tab-bar.tsx`, `src/builder/builder-page.tsx` (`MenuTrigger`/`Menu`), `src/builder/structure-tree.tsx` (RAC `Tree`) -- slice candidates and the custom part
- `tests/primitives.e2e.ts` + `tests/fixtures/primitives.tsx` -- the primitives' contract: colours, 32 px, focus outline, tap/click, disabled reasons, banner live region
- `tests/window.e2e.ts` -- tab radii, focus outline, colours

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `components.json`, `src/lib/utils.ts`, `src/components/ui/*` -- `shadcn init --base aria` and `shadcn add` for the slice -- evidence for AC1
- [x] `src/ui/main.css` -- map shadcn variables onto `--mr-*`, keep DESIGN.md radii and font -- AC2
- [x] `src/ui/primitives/*` and their callers -- port onto the shadcn components, keeping the props contract -- AC3, AC5
- [x] measure `bun run build` sizes before and after, run the full check -- the verdict
- [ ] (not done: the spike does not hold) `DESIGN.md` -- name the shadcn tokens and which components come from shadcn -- AC4, only if the spike holds
- [ ] (not done: the spike does not hold) remaining UI (window, settings, picker, builder) -- only if the spike holds

**Acceptance Criteria:**
- Given the spike, when it is judged, then the task notes record whether shadcn aria works with RAC 1.22.1 and Tailwind 4.3.5, with bundle sizes, e2e results and code weight.
- Given the spike holds, when the migration ends, then the full check passes and no e2e was weakened.
- Given the spike does not hold, when the work stops, then the branch carries the spike commits and the findings, and no further UI is migrated.

## Implementation Notes

Implemented in this session, not by a dispatched subagent: the spike is exploratory, and its findings were the plan.

- Compatibility (AC1): `bunx shadcn@4.23.0 init --base aria -t vite -p mira` found Vite and Tailwind v4, wrote `components.json` (style `aria-mira`), and its components typecheck against react-aria-components 1.22.1, React 19.3.1 and TypeScript 7.0.2 with no upgrade. The registry has 62 aria components; no Tree, no NumberField, no `menu` (it is `dropdown-menu`).
- Raw init output broke 8 browser tests: its `@theme inline` redefined `--color-accent`, the radii and the font (Inter via `@fontsource-variable/inter`). It also added `@hugeicons/*`, `tw-animate-css`, `shadcn` (as a runtime dependency) and `shadcn/tailwind.css`.
- Kept: `class-variance-authority` 0.7.1 and `cn` 0.5.2 (runtime). Dropped: Inter, hugeicons, `tw-animate-css`, `shadcn` package and its CSS (only animations and `data-*` variants Tailwind 4 already has).
- Theme (AC2): shadcn colour names are `@theme static` aliases of `--mr-*` in `src/ui/main.css`; `dark:` follows `data-theme-mode`. Screenshots before and after (dark sheet, dark menu, light sheet, light settings) differ in 0.1–0.4 % of pixels, all from typing timing and the menu; density is the same.
- Every taken component needed nearly all of its classes rewritten to meet DESIGN.md and the Accessibility Floor: `outline-none` + 30 % ring instead of the 2 px outline, 28 px (`h-7`) controls instead of 32 px, 10–12 px text and `font-medium`, Inter, shadows and animations, `.dark` class. What survives from shadcn is the cva variant table, `data-slot` and the Popover+Menu composition.
- `outline-hidden` on shadcn menu items hid the focus outline; no existing test caught it. Fixed, and `tests/delete.e2e.ts` now checks the menu item outline (red with the class, green without).
- `cn` merges like tailwind-merge and dropped `text-label-sm` when a colour class followed. It now runs on tables compiled by `bun run cn:build` from `src/` and the `@theme`; `src/lib/cn-tables.test.ts` fails when they are stale. The tables file is excluded from Tailwind scanning, lint and format.
- Bundle (`bun run build`, gzip, after review fixes): window-shell chunk 53.19 → 61.88 kB (+8.69, +16.3 %); raw 169.55 → 190.05 kB. main CSS 4.59 → 4.83 kB. With the default `cn` it was +11.7 kB gzip; with `cn/config` +17 kB; a plain join would cost +0.8 kB but loses the className override that shadcn's pattern rests on.
- Code weight: the four primitives were 187 lines; now 196 lines of wrappers + 255 lines of shadcn components + `src/lib` (8 lines and a generated 6.7 kB table), about 2.5× the hand-maintained lines for the same behaviour.
- Full check after the review fixes and the master merge: format clean, lint 0 errors, typecheck clean, bun test 2564 pass, test:browser 468 pass, build ok. Screenshots after the fixes: the menu matches the baseline; the remaining 0.1–0.2 % pixel difference is the typed sheet name.

Verdict: the spike works but does not hold for a migration. All three of the owner's measures go the wrong way or stay level: bundle +16.3 % gzip on the window chunk, accessibility parity only after rewriting the defaults (the review found two more defaults that changed behaviour: a clipped menu outline and labels that no longer wrap), and about 2.5× the code for the same four controls. shadcn adds a layer over react-aria-components that this design system must restyle in full, so `shadcn add` output is a starting point to rewrite, not a component to keep. No further UI was migrated, and DESIGN.md is unchanged (AC4 applies only if the migration goes ahead).

## Spec Change Log

## Review Triage Log

Pass 1 (blind, edge-case, verification-gap), diff `e318b16..dc6839e` without `bun.lock` and the generated tables.

| Finding | Verdict | Evidence / route |
|---|---|---|
| Menu `overflow-y-auto` (Menu and Popover) clips the items' focus outline; the e2e checks only computed style | high | Before, neither had overflow; the Menu box equals the item width, so the 3 px outline was cut. Patch: no overflow classes; `delete.e2e.ts` now asserts no clipping box between item and popover (red with the class) |
| `min-w-32` generates no CSS under `--*: initial` | low | Absent from built CSS. Patch: removed |
| Button/Badge base adds `whitespace-nowrap shrink-0 select-none w-fit` to every Pressable, chip, dice button, settings link | medium | Behaviour change the spec forbids: long dice labels stop wrapping. Patch: bases back to the old primitive base |
| `TabsContent` duplicates `CONTENT_CLASS` | medium | Previews use `CONTENT_CLASS`; two copies drift. Patch: `Tabs`/`TabsContent` carry no classes, the window passes them |
| `popover` and `muted` aliases are not rendered by any test | medium (gap) | Patch: new `delete.e2e.ts` test checks popover `surface-bar`, focused item `surface-tab`, 32 px (red with `bg-surface`) |
| Freshness test copies the `cn:build` arguments | low | Patch: `scripts/cn-tables.ts` holds the options for the script and the test |
| `cn:build` glob reads its own output and test files | low | Patch: options list shipped sources only |
| No test covers the pressed-chip merge across alias names | low | Patch: `utils.test.ts` case |
| Unused shadcn parts: `Alert` component, `DropdownMenuSeparator`, destructive item variant, `group/*` | low | Patch: removed. The unused colour aliases and `dark:` variant stay on purpose: they are the full shadcn variable map for any later `shadcn add` |
| Import groups mixed in four components | low | Patch: packages, blank line, `@/` |
| `components.json` keeps `iconLibrary: hugeicons` and `cssVariables: true`; the next `shadcn add` brings icons and `:root`/`.dark` variables back | medium | Real; recorded in the verdict as a cost of the approach. Defer: only matters if the migration goes ahead |
| `DropdownMenu` exposes only `placement`/`offset` of the Popover | false | No caller needs more; adding props is not a defect |
| `Pressable` runs the base classes twice | low | `cn` removes the copies; harmless, fix needs a restructure. Rejected |
| `CLAUDE.md` map lacks `src/components`, `src/lib`, `cn:build` | low | Agent-context file. Defer: only if the branch is adopted |
| Diff lacks the verdict | false | Recorded in Implementation Notes after the diff was cut |
| Builder "Открыть" menu and Input have no own outline test | low | Same `DropdownMenuItem`/`Input` components as the covered ones; rejected |

## Design Notes

Decisions taken without the owner (he asked for autonomous work and reviews the branch):
- Style preset `aria-mira` ("compact, for dense interfaces"): the closest to DESIGN.md density.
- shadcn's `accent` (hover highlight) collides with the project's `accent` (Owlbear primary). The project's meaning wins: `accent-foreground` is the accent's contrast text, and the taken components highlight with `bg-muted` (`{colors.surface-tab}`).
- Verdict criteria are the owner's: bundle size, accessibility parity (existing e2e green) and code weight.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build` -- all pass
- `bun run build` -- compare asset sizes with the baseline at `e318b16`
