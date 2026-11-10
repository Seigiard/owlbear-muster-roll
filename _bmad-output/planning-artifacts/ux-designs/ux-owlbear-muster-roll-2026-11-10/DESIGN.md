---
name: Muster Roll
description: Plain, dense sheets inside an Owlbear Rodeo window. Colours come from the live Owlbear theme; the hex values are fallbacks for tests and mocks.
status: final
created: 2026-11-10
updated: 2026-11-10
sources:
  - ../../../specs/spec-muster-roll/SPEC.md
  - ../../../specs/spec-muster-roll/preset-format.md
  - ../../../specs/spec-muster-roll/storage-and-sync.md
  - ../../architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
colors:
  surface: '#333333'
  surface-bar: '#2A2A2A'
  surface-tab: '#3A3A3A'
  surface-stripe: '#2D2D2D'
  text: '#DDDDDD'
  text-muted: '#AAAAAA'
  accent: '#D9B36C'
  accent-contrast: '#222222'
  line: '#4A4A4A'
  line-strong: '#888888'
  focus: '#D9B36C'
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

Colours follow `OBR.theme` at runtime and change when the Owlbear theme changes. The hex values above are fallbacks for tests and mocks.

| Token | Runtime source |
| --- | --- |
| `{colors.surface}` | `theme.background.paper` |
| `{colors.surface-bar}` | `theme.background.default` |
| `{colors.surface-tab}` | `color-mix(in srgb, theme.background.paper 90%, theme.text.primary)` |
| `{colors.surface-stripe}` | `color-mix(in srgb, theme.background.paper 92%, theme.background.default)` |
| `{colors.line}` | `color-mix(in srgb, theme.background.paper 80%, theme.text.primary)` |
| `{colors.line-strong}` | `color-mix(in srgb, theme.background.paper 50%, theme.text.primary)` |
| `{colors.focus}` | `theme.primary.main` |
| `{colors.text}` | `theme.text.primary` |
| `{colors.text-muted}` | `theme.text.secondary` |
| `{colors.accent}` | `theme.primary.main` |
| `{colors.accent-contrast}` | `theme.primary.contrastText` |

Warning and danger colours do not come from Owlbear. In light mode use the `-light` tokens. They appear only as surface and text pairs, in the status banner and the pending mark. `{colors.text-muted}` is for hints, status chips and section captions.

## Typography

System font only, because a window loads inside Owlbear and must render at once. `{typography.body}` is for labels and values. `{typography.section-heading}` is for preset section titles.

## Layout & Spacing

The window has the tab bar, an optional banner and one scrolling content area with padding of `{spacing.3}`. Sections are blocks that take the preset's section width and wrap as whole blocks. Below 480 px each section takes the full width. Inside a `columns` section, the rows always share one grid. If the grid does not fit, the section scrolls horizontally. Gaps use `{spacing.1}` inside a row, `{spacing.2}` between controls and `{spacing.4}` between sections.

## Elevation & Depth

No shadows inside the window. Layers differ by tone: `{colors.surface-bar}` behind `{colors.surface}`.

## Shapes

Tabs use `{rounded.md}` on the top corners. The window uses `{rounded.lg}`. Chips use `{rounded.full}`. Buttons use `{rounded.sm}`.

## Components

| Component | Visual rule |
| --- | --- |
| Tab bar | `{components.tab}` for each tab. The active tab uses `{components.tab-active}` and joins the content area |
| Character header | Name in `{typography.sheet-title}`, chips after it, `⋯` at the end, bottom rule in `{colors.line}` |
| Field value | Arrangement comes from the preset. Even preset rows use `{colors.surface-stripe}`. An editable value has a dotted underline in `{colors.line-strong}` |
| Pending mark | Text "Ожидает" in `{typography.label-sm}`, as the warning surface and text pair, after the value |
| Section | `{typography.section-heading}` in `{colors.accent}`, with a left rule in `{colors.line}` |
| Chip | `{components.chip}`, `{typography.label-sm}` |
| Dice button | `{components.dice-button}`, `{typography.label-sm}` |
| Status banner | `{components.banner-warning}` or `{components.banner-danger}`, full window width |
| Access panel, NPC menu, Confirmation | Inline block on `{colors.surface-bar}` with a `{colors.line}` border and `{rounded.md}` |
| NPC block | Name in `{typography.section-heading}`, left rule in `{colors.line}` |
| Settings actions | First action `{components.button-primary}`, the others `{components.button-secondary}` |
| Focus | 2 px outline in `{colors.focus}` on every control. Never removed |
| Disabled | Control at 50% opacity, with a text reason near it |

## Do's and Don'ts

- Do follow the Owlbear theme in every window.
- Do let the preset decide the arrangement of sheet content.
- Don't add colour coding for game concepts. The extension does not know what a stat means.
- Don't add icons where a word fits, except the gear.
