---
title: '1.2 See a Window That Belongs to Owlbear'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: 'f8b9a3ba8a0cf1cf22e7f2c02eb708a59889634d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The window is an empty root with no Owlbear colors, layout, shared controls or interface text, so later sheet stories have nothing to build on. Backlog task: TASK-4, whose eight acceptance criteria apply in full.

**Approach:** Add the `DESIGN.md` tokens to Tailwind, map theme colors from `OBR.theme` at runtime, build the window shell, the Button, Chip, Field and Banner primitives, and one copy catalog.

## Boundaries & Constraints

**Always:** Use only `DESIGN.md` tokens. Remove Tailwind's default color, shadow, radius, spacing, text and font scales so foreign values cannot be used. Warning and danger tokens are fixed hex. Interface strings come from the catalog. The shell root stays the `<main>` child of `#root`.

**Never:** Put a hex value of a theme-mapped token in the production CSS or bundle. Add records, projection, sheet tabs, Settings, or banner conditions (later stories). Run a deploy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dark theme | Mock theme, window open | Computed surface, bar, tab, stripe, line, focus, text and accent colors follow the `DESIGN.md` table | N/A |
| Theme change | `theme.onChange` fires a light theme | Every mapped token, the `color-mix` ones included, updates with no reload | N/A |
| Light banner | Light mode, warning and danger pairs | Pairs use the `-light` hex values; contrast at least 4.5:1 | N/A |
| Dark banner | Dark mode, warning and danger pairs | Pairs use the dark hex values; contrast at least 4.5:1 | N/A |
| Keyboard focus | Tab to Button, Chip, Field | 2 px outline in `focus`; height at least 32 px | N/A |
| Disabled primitive | Button or Field disabled | 50% opacity; reason text is visible near it; press does nothing | A disabled control with no reason fails typecheck |
| Touch and mouse | Tap, then click on a Button | One action each | N/A |
| Theme read fails | `getTheme` rejects | Window still renders; error goes to the console | Rejection is caught |
| Production build | Default-mode CSS and JS | No mapped hex such as `#D9B36C`; fixed warning hex present | Build test fails |
| Copy catalog | Every row of the `EXPERIENCE.md` Voice and Tone table | Catalog returns the exact Russian text, with placeholders filled | Test fails |

</frozen-after-approval>

## Code Map

- `src/ui/main.tsx`, `src/ui/main.css` -- current entry; extend, keep the `source('..')` scan limit.
- `src/platform/ports.ts` -- `Theme`, `ThemePort`; reuse as is.
- `src/platform/mock/index.ts` -- `MOCK_THEME` and a no-op `theme.onChange`; make the change event real.
- `tests/smoke.e2e.ts`, `tests/build.test.ts`, `playwright.config.ts` -- extend; the server runs `vite --mode mock`.
- `DESIGN.md` Colors table and front matter -- the token source. `EXPERIENCE.md` lines 50-77 -- the copy source. `mockups/shell.html` -- layout reference only; the written documents win.

## Tasks & Acceptance

**Execution:**
- [x] `src/ui/main.css` -- `@theme static` with all tokens; mapped colors point at runtime variables with no hex; fixed warning and danger hex; a light-mode rule swaps those pairs to the `-light` tokens; a global `:focus-visible` 2 px outline -- AC 1 to 3 and 5.
- [x] `src/ui/theme.ts` -- pure mapping from `Theme` to tokens by the `DESIGN.md` table, apply to the root element with the mode, follow `ThemePort` -- AC 2 and 3.
- [x] `src/ui/copy.ts` -- the whole Voice and Tone table; placeholders are typed functions -- AC 8.
- [x] `src/ui/primitives/{button,chip,field,banner}.tsx` -- on react-aria; 32 px minimum; the disabled state requires a reason by type; Banner is a live region -- AC 3 and 5 to 7.
- [x] `src/ui/shell/{window-shell,tab-bar}.tsx` -- tab bar with react-aria tabs, optional banner slot, one scrolling content area -- AC 4.
- [x] `src/ui/main.tsx` -- apply the theme, then render the shell with the "NPC" tab, the gear (accessible name "Настройки") and "Загрузка…" -- AC 4.
- [x] `src/platform/mock/index.ts` -- a working theme change, reachable from Playwright in mock mode only -- AC 2.
- [x] `tests/fixtures/primitives.html`, `tests/fixtures/primitives.tsx` -- dev-server page with every primitive state; not a build input -- AC 3, 5 to 7.
- [x] `src/ui/theme.test.ts`, `src/ui/copy.test.ts`, `tests/window.e2e.ts`, `tests/primitives.e2e.ts`, `tests/build.test.ts` -- every matrix row. The copy test reads `EXPERIENCE.md`; expected colors are literals; contrast uses rendered colors.

**Acceptance Criteria:** the eight criteria of TASK-4. The window-size part of criterion 4 is a human gate.

## Implementation Notes

- A control is disabled only through `disabledReason`. The primitives have no `isDisabled` prop, so a disabled control with no reason does not compile. `tests/fixtures/primitives.tsx` holds the `@ts-expect-error` checks.
- `--*: initial` clears the whole default Tailwind theme, which is wider than the six scales the spec names. Breakpoint, weight and leading utilities are gone too.
- With no `--spacing` multiplier, zero utilities such as `min-h-0` are not generated. Use `min-h-[0]`.
- The 32 px minimum is the `touch-target` utility in `main.css`, because no spacing token has that value.
- `Banner` stays mounted as an empty live region, so the shell always renders it and the `banner` prop carries the message.
- Tabs use `spacing-2` between them, as the written documents say for controls. The mockup uses 4 px.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Verification: status chip unobserved | low | Mutation filed. Patched with a test. |
| Verification: Field value wiring untested | medium | Mutation filed; Story 1.9 depends on it. Patched with a test. |
| Verification: Button colors and Field underline unchecked | low | Mutation filed. Patched with tests. |
| Verification: tabs lack focus and height checks | medium | UX-DR36 covers every control. Patched with tests. |
| Verification: theme-before-render order unverified | medium | First test stayed green under the mutation; a slow-read mock mode made it red. Patched. |
| Verification: applied font sizes unverified | low | Patched with tests. |
| Blind and Edge: failed theme read leaves no colors or focus | medium | Reproduced on the failed-read page. Patched with non-hex system-color fallbacks. |
| Blind: TabPanel focus outline clipped | medium | Reproduced: the panel is flush with an `overflow: hidden` parent. Patched with an inset outline. |
| Blind: no `color-scheme` | low | Patched. Applied on `main`, because a root scheme that differs from Owlbear's gives the iframe an opaque canvas. |
| Blind and Edge: build test matches utilities by prefix | medium | False green confirmed by reading the check. Patched with exact selectors. |
| Blind: token values unverified | medium | A changed size stayed green. Patched against the `DESIGN.md` front matter; observed red. |
| Blind and Edge: no error boundary; render catch looks dead | low | Rejected: React already logs the crash, and a boundary adds a component with no fallback copy defined. |
| Edge: `port.onChange` throws synchronously | false | The SDK call only registers a listener. The outer catch logs if it ever throws. |
| Blind and Edge: shared children, per-tab content, remount | false | One loading text exists in this story. Deferred to Stories 1.5 and 1.11, which give the tabs content. |
| Blind and Edge: empty `disabledReason` disables with no text | low | Rejected: reasons come from the catalog, no caller passes an empty string, and a type cannot express non-empty. |
| Blind: disabled reason is a sibling of the button | low | Direct correction. Patched with one inline column wrapper. |
| Blind: `window.setMockTheme` is a required global | low | Rejected: no production code calls it, and the build test keeps the mock out of production. |
| Blind: TabList has no accessible name | low | Rejected here: it needs a string absent from `EXPERIENCE.md`. Deferred to Story 1.6. |
| Blind: copy check is one-way | false | Later stories add strings from other `EXPERIENCE.md` sections, so a reverse check would reject valid entries. |
| Blind: `mockRestore` after `expect` | low | Direct correction. Patched with `afterEach`. |
| Blind: duplicated test helpers | low | Direct correction. Patched in `tests/support`. |
| Edge: stalled theme read blanks the window up to 5 s | low | Rejected: the read follows a completed SDK handshake, and a timeout race adds timers. |
| Edge: empty tabs show no content | false | No caller passes an empty list. Story 2.3 owns the player tab bar. |
| Edge: tab overflow clips tabs | false | Two tabs exist here. Story 1.6 owns overflow (UX-DR8). |

## Design Notes

- Mapped tokens look like `--color-surface: var(--mr-surface)`, and `theme.ts` sets `--mr-*`. The hex fallbacks then live only in the mock's theme.
- The "NPC" tab and the gear are real react-aria tabs that only change the active state. Stories 1.5 and 1.11 give them content. They let the owner judge the look in a live room.

## Verification

**Commands:**
- `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner: deploy, open the window in both Owlbear themes, confirm or adjust the 720 by 600 px size.
