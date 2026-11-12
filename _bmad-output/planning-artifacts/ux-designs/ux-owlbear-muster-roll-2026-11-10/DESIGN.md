---
name: Muster Roll
description: Plain, dense sheets inside an Owlbear Rodeo window. Colours come from the live Owlbear theme; the hex values are its dark theme, the fallback for tests and mocks.
status: final
created: 2026-11-10
updated: 2026-11-12
sources:
  - ../../../specs/spec-muster-roll/SPEC.md
  - ../../../specs/spec-muster-roll/preset-format.md
  - ../../../specs/spec-muster-roll/storage-and-sync.md
  - ../../architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
colors:
  surface: '#222639'
  surface-bar: '#1E2231'
  surface-tab: '#383C4D'
  surface-stripe: '#222638'
  text: '#FFFFFF'
  text-muted: '#FFFFFFB3'
  accent: '#BB99FF'
  accent-contrast: '#000000DE'
  line: '#4E5161'
  line-strong: '#91939C'
  focus: '#BB99FF'
  warning-surface: '#4A3A1E'
  warning-text: '#FFD894'
  danger-surface: '#4F2B26'
  danger-text: '#FFB4A8'
  warning-surface-light: '#FFF1D6'
  warning-text-light: '#6B4700'
  danger-surface-light: '#FDE3DF'
  danger-text-light: '#8A2318'
typography:
  body:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
  label-sm:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  section-heading:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
  sheet-title:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.3'
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
components:
  tab:
    background: '{colors.surface-tab}'
    foreground: '{colors.text}'
    radius: '{rounded.md}'
  tab-active:
    background: '{colors.surface}'
    foreground: '{colors.accent}'
  chip:
    foreground: '{colors.text}'
    border: '{colors.line}'
    radius: '{rounded.full}'
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.accent-contrast}'
    radius: '{rounded.sm}'
  button-secondary:
    foreground: '{colors.text}'
    border: '{colors.line}'
    radius: '{rounded.sm}'
  dice-button:
    foreground: '{colors.accent}'
    border: '{colors.accent}'
    radius: '{rounded.sm}'
  banner-warning:
    background: '{colors.warning-surface}'
    foreground: '{colors.warning-text}'
  banner-danger:
    background: '{colors.danger-surface}'
    foreground: '{colors.danger-text}'
---

## Brand & Style

Muster Roll is a tool on the table, not a product with a personality. It looks like part of Owlbear. It takes its density and section structure from DummySheet (`imports/dummysheet-hero.png`): titled sections, label on the left, value on the right, no decoration. The layout reference is `mockups/shell.html`.

## Colors

Colours follow `OBR.theme` at runtime and change when the Owlbear theme changes. The hex values above are the dark theme of a live Owlbear room, the fallback for tests and mocks. The light theme of a live room is: paper `#F1F3F9`, default `#DDE1EE`, text `rgba(0, 0, 0, 0.87)`, secondary text `rgba(0, 0, 0, 0.6)`, primary `#9966FF`, contrast text `#FFFFFF`. `src/preview/themes.ts` holds both.

| Token | Runtime source |
| --- | --- |
| `{colors.surface}` | `theme.background.paper` |
| `{colors.surface-bar}` | `theme.background.default` |
| `{colors.surface-tab}` | `color-mix(in srgb, theme.background.paper 90%, theme.text.primary)` |
| `{colors.surface-stripe}` | `color-mix(in srgb, theme.background.paper 92%, theme.background.default)` |
| `{colors.line}` | `color-mix(in srgb, theme.background.paper 80%, theme.text.primary)` |
| `{colors.line-strong}` | `color-mix(in srgb, theme.background.paper 50%, theme.text.primary)` |
| `{colors.focus}` | The same as `{colors.accent}` |
| `{colors.text}` | `theme.text.primary` |
| `{colors.text-muted}` | `theme.text.secondary` |
| `{colors.accent}` | Dark mode: `theme.primary.main`. Light mode: `color-mix(in srgb, theme.primary.main 65%, theme.text.primary)` |
| `{colors.accent-contrast}` | `theme.primary.contrastText` |

The light Owlbear primary gives 3.3:1 on the paper and 3.7:1 under its contrast text. Mixing in the text colour raises the light accent to 4.6:1 or more on every surface and 6.2:1 under the contrast text. The browser tests compute these ratios in both themes.

Warning and danger colours do not come from Owlbear. In light mode use the `-light` tokens. They appear only as surface and text pairs, in the status banner and the pending mark. `{colors.text-muted}` is for hints, status chips and section captions.

## Typography

System font only, because a window loads inside Owlbear and must render at once. `{typography.body}` is for labels and values. `{typography.section-heading}` is for preset section titles.

## Layout & Spacing

The window has the tab bar, an optional banner and one scrolling content area with padding of `{spacing.3}`. Sections take the preset's section width and wrap as whole sections. Below 480 px each section takes the full width. Inside a `columns` section, the rows always share one grid. If the grid does not fit, the section scrolls horizontally. Gaps use `{spacing.1}` inside a row, `{spacing.2}` between controls and `{spacing.4}` between sections.

## Elevation & Depth

No shadows inside the window. Layers differ by tone: `{colors.surface-bar}` behind `{colors.surface}`.

## Shapes

Tabs use `{rounded.md}` on the top corners. The window uses `{rounded.lg}`. Chips use `{rounded.full}`. Buttons use `{rounded.sm}`.

## Components

| Component | Visual rule |
| --- | --- |
| Tab bar | `{components.tab}` for each tab. The active tab uses `{components.tab-active}` and joins the content area |
| Sheet header | Name or single sheet title in `{typography.sheet-title}`, chips after it, `⋯` at the end, bottom rule in `{colors.line}` |
| Field value | Arrangement comes from the preset. Even preset rows use `{colors.surface-stripe}`. An editable value has a dotted underline in `{colors.line-strong}` |
| Pending mark | Text "Ожидает" in `{typography.label-sm}`, as the warning surface and text pair, after the value |
| Section | `{typography.section-heading}` in `{colors.accent}`, with a left rule in `{colors.line}` |
| Chip | `{components.chip}`, `{typography.label-sm}` |
| Dice button | `{components.dice-button}`, `{typography.label-sm}` |
| Status banner | `{components.banner-warning}` or `{components.banner-danger}`, full window width |
| Access panel, duplicate count, Confirmation | Inline block on `{colors.surface-bar}` with a `{colors.line}` border and `{rounded.md}` |
| Repeat block | The block's rows, then its controls in `{typography.label-sm}`. Blocks are separated by a `{colors.line}` rule |
| Selection mark | On a tab, a 6 px `{colors.accent}` dot with `{rounded.full}` after the name and its mark. On a repeat block, a 3 px `{colors.accent}` bar on its left edge. The tab bar has no room for a word, and the accessible name carries it |
| Map toggle | "Выделить на карте" as `{components.button-secondary}`. Pressed: `{colors.accent}` border and text |
| Settings actions | First action `{components.button-primary}`, the others `{components.button-secondary}` |
| Focus | 2 px outline in `{colors.focus}` on every control. Never removed |
| Disabled | Control at 50% opacity, with a text reason near it |

### Preset builder

The builder is a top-level page, not inside Owlbear, so no live Owlbear theme exists. It takes the two Owlbear theme copies in `src/preview/themes.ts` (dark and light) through the same token mapping as the window. It opens in the system colour scheme, and the "Светлая тема" switch overrides it. Layout reference: variant B of `.working/builder-layouts.html`.

| Component | Visual rule |
| --- | --- |
| Page | `{colors.surface-bar}` behind the panes. Full viewport height. No page scroll: each pane scrolls inside |
| Top bar | 44 px high, `{colors.surface-bar}`, bottom rule in `{colors.line}`. Page name in `{typography.section-heading}`, draft status in `{typography.label-sm}` `{colors.text-muted}`. "Скачать пресет" is `{components.button-primary}`; the other controls are `{components.button-secondary}` |
| Problem counter | A chip with `{rounded.full}`: the danger surface and text pair while problems exist, `{components.chip}` with none |
| Left column | 420 px wide, `{colors.surface}`, right rule in `{colors.line}`. The tree takes the upper part and the form the lower part, split by a `{colors.line}` rule, each scrolling on its own |
| Pane title | `{typography.label-sm}` in `{colors.text-muted}`, padding `{spacing.2}` `{spacing.3}` |
| Tree item | `{typography.body}` at 13 px, 28 px high, `{rounded.sm}`, indented 14 px per level. A kind tag in `{typography.label-sm}` `{colors.text-muted}` with a `{colors.line}` border. Ids in a monospace font, `{colors.text-muted}`. Selected: `{colors.accent}` background and `{colors.accent-contrast}` text. A problem: a "!" chip in the danger pair at the row end. Add items: `{colors.text-muted}`, "+" before the text |
| Drop indicator | A 2 px `{colors.accent}` line between items, or a `{colors.accent}` outline on the target container |
| Form | Padding `{spacing.3}`, `{spacing.3}` between controls. Labels above inputs in `{typography.label-sm}` `{colors.text-muted}`. Inputs on `{colors.surface-bar}` with a `{colors.line}` border and `{rounded.sm}`; ids and formulas in a monospace font. A segmented choice for 2–3 options, the chosen one on `{colors.surface-tab}` in `{colors.accent}`. Messages: hints in `{colors.text-muted}`, problems and warnings in the danger and warning pairs |
| Preview pane | `{colors.surface-bar}`, the frame centred at the top with `{spacing.4}` around it. The frame is the window at the preset's size with `{rounded.lg}` and a `{colors.line}` border. It scales down with its proportions when the pane is narrower |
| Preview marks | Selected item: 2 px solid `{colors.accent}` outline, offset 1 px. Problem: 2 px dashed `{colors.danger-text}` outline. Placeholder: the field id in `{colors.text-muted}` |
| Confirmation and file message | The window's inline confirmation block, full width under the top bar |

## Do's and Don'ts

- Do follow the Owlbear theme in every window. The builder follows its Owlbear theme copies.
- Do let the preset decide the arrangement of sheet content.
- Don't add colour coding for game concepts. The extension does not know what a stat means.
- Don't add icons where a word fits, except the gear.
