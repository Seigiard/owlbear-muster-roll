---
name: Muster Roll
description: Quiet, dense sheets inside an Owlbear Rodeo window, in the manner of Linear, with a palette derived from the live Owlbear theme; the hex values are the dark theme, the fallback for tests and mocks.
status: final
created: 2026-11-10
updated: 2026-11-14
sources:
  - ../../../specs/spec-muster-roll/SPEC.md
  - ../../../specs/spec-muster-roll/preset-format.md
  - ../../../specs/spec-muster-roll/storage-and-sync.md
  - ../../architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - ../../../forge/sidebar-tabs-layout/forged-idea.md
colors:
  surface: '#222639'
  surface-bar: '#1E2231'
  surface-raised: '#2F3345'
  surface-tab: '#383C4D'
  surface-stripe: '#383B4C'
  fill: '#FFFFFF14'
  fill-strong: '#FFFFFF24'
  text: '#FFFFFF'
  text-muted: '#FFFFFFB3'
  accent: '#BB99FF'
  accent-soft: '#BB99FF2E'
  accent-ink: '#D3BDFF'
  accent-contrast: '#000000DE'
  line: '#4E5161'
  hairline: '#FFFFFF1A'
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
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
  label-sm:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  caption:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1.4'
  section-heading:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
  sheet-title:
    fontFamily: 'system-ui, sans-serif'
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: '-0.025em'
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '6': 24px
components:
  sidebar:
    background: '{colors.surface-bar}'
    border: '{colors.line}'
  sidebar-entry:
    foreground: '{colors.text-muted}'
    hover: '{colors.fill}'
    radius: '{rounded.md}'
  sidebar-entry-active:
    background: '{colors.fill-strong}'
    foreground: '{colors.text}'
  tab:
    foreground: '{colors.text-muted}'
  tab-active:
    foreground: '{colors.text}'
    underline: '{colors.text}'
  section-heading:
    foreground: '{colors.text-muted}'
    rule: '{colors.hairline}'
  value-ghost:
    border: transparent
    hover-border: '{colors.line}'
    focus-background: '{colors.fill}'
    touch-background: '{colors.fill}'
    radius: '{rounded.sm}'
  chip:
    background: '{colors.fill}'
    foreground: '{colors.text-muted}'
    border: '{colors.hairline}'
    radius: '{rounded.full}'
  chip-pressed:
    background: '{colors.accent-soft}'
    foreground: '{colors.accent-ink}'
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.accent-contrast}'
    radius: '{rounded.md}'
  button-secondary:
    background: '{colors.fill}'
    hover: '{colors.fill-strong}'
    foreground: '{colors.text}'
    border: '{colors.hairline}'
    radius: '{rounded.md}'
  dice-button:
    background: '{colors.accent-soft}'
    foreground: '{colors.accent-ink}'
    hover-background: '{colors.accent}'
    hover-foreground: '{colors.accent-contrast}'
    radius: '{rounded.md}'
  panel:
    background: '{colors.surface-raised}'
    border: '{colors.hairline}'
    radius: '{rounded.lg}'
  popover:
    background: '{colors.surface-raised}'
    radius: '{rounded.lg}'
  banner-warning:
    background: '{colors.warning-surface}'
    foreground: '{colors.warning-text}'
  banner-danger:
    background: '{colors.danger-surface}'
    foreground: '{colors.danger-text}'
---

## Brand & Style

Muster Roll is a tool on the table. It sits inside Owlbear and takes its hues from Owlbear's theme, and it speaks the quiet visual language of Linear: neutral navigation, hairline rules instead of boxes, muted labels beside bright values, and controls that stay silent until the pointer reaches them. Only a roll and the map selection take the accent. It takes its density and section structure from DummySheet (`imports/dummysheet-hero.png`): titled sections, label on the left, value on the right, no decoration. The layout reference is `mockups/shell.html` for the sheet, and `imports/sidebar-tabs-sketch.png` for the sidebar and the tab row; the mock's tab bar of sheets is out of date.

## Colors

Colours follow `OBR.theme` at runtime and change when the Owlbear theme changes. The hex values above are the dark theme of a live Owlbear room, the fallback for tests and mocks. The light theme of a live room is: paper `#F1F3F9`, default `#DDE1EE`, text `rgba(0, 0, 0, 0.87)`, secondary text `rgba(0, 0, 0, 0.6)`, primary `#9966FF`, contrast text `#FFFFFF`. `src/preview/themes.ts` holds both.

| Token | Runtime source |
| --- | --- |
| `{colors.surface}` | `theme.background.paper` |
| `{colors.surface-bar}` | `theme.background.default` |
| `{colors.surface-raised}` | Dark mode: `color-mix(in srgb, theme.background.paper 94%, #fff)`. Light mode: `color-mix(in srgb, theme.background.paper 35%, #fff)` |
| `{colors.surface-tab}` | `color-mix(in srgb, theme.background.paper 90%, theme.text.primary)`. The preset builder only |
| `{colors.surface-stripe}` | `color-mix(in srgb, {colors.surface-raised} 96%, theme.text.primary)`. Unused by the window since rows no longer stripe |
| `{colors.hairline}` | `color-mix(in srgb, theme.text.primary 10%, transparent)` |
| `{colors.fill}` | `color-mix(in srgb, theme.text.primary 8%, transparent)` |
| `{colors.fill-strong}` | `color-mix(in srgb, theme.text.primary 14%, transparent)` |
| `{colors.line}` | `color-mix(in srgb, theme.background.paper 80%, theme.text.primary)` |
| `{colors.line-strong}` | `color-mix(in srgb, theme.background.paper 50%, theme.text.primary)` |
| `{colors.focus}` | The same as `{colors.accent}` |
| `{colors.text}` | `theme.text.primary` |
| `{colors.text-muted}` | `theme.text.secondary` |
| `{colors.accent}` | Dark mode: `theme.primary.main`. Light mode: `color-mix(in srgb, theme.primary.main 65%, theme.text.primary)` |
| `{colors.accent-soft}` | `color-mix(in srgb, {colors.accent} 18%, transparent)` in dark mode, `12%` in light mode |
| `{colors.accent-ink}` | Dark mode: `color-mix(in srgb, {colors.accent} 65%, #fff)`. Light mode: `color-mix(in srgb, {colors.accent} 80%, theme.text.primary)` |
| `{colors.accent-contrast}` | `theme.primary.contrastText` |

The light Owlbear primary gives 3.3:1 on the paper and 3.7:1 under its contrast text. Mixing in the text colour raises the light accent to 4.6:1 or more on every surface and 6.2:1 under the contrast text. The dark primary gives only 3.9:1 on its own tint, so accent text uses `{colors.accent-ink}`: 4.5:1 or more on every plain surface and and on `{colors.accent-soft}` over each of them. The ink never sits on a neutral fill. The browser tests compute these ratios in both themes.

The fills and `{colors.accent-soft}` are translucent, so one control reads the same on the paper, the sidebar and a panel.

The accent has two jobs. `{colors.accent}` fills and draws: primary buttons, the focus ring, the map selection mark, a hovered dice button. `{colors.accent-ink}` writes: a dice button, a pressed chip, a pressed map toggle. Navigation never takes the accent: a selected entry or tab is neutral.

Warning and danger colours do not come from Owlbear. In light mode use the `-light` tokens. They appear only as surface and text pairs, in the status banner and the pending mark. `{colors.text-muted}` is for hints, status chips and section captions.

## Typography

System font only, because a window loads inside Owlbear and must render at once. `{typography.body}` is for labels and values; a label cell is `{colors.text-muted}`, a value `{colors.text}`, so the value is what the eye finds. Values use tabular figures. `{typography.section-heading}` is for preset and Settings section titles. `{typography.caption}` is for sidebar group headings, chips and tooltips. `{typography.sheet-title}` is the sheet name.

## Layout & Spacing

The window has the sidebar at the left, 10 rem wide and always shown, and the content column at the right. The content column has an optional banner, the sheet header, the tab row when the sheet has more than one tab, and one scrolling content area with padding of `{spacing.3}`. Sections take the preset's section width and wrap as whole sections. Below 480 px of content width each section takes the full width. Inside a `columns` section, the rows always share one grid. If the grid does not fit, the section scrolls horizontally. Gaps use `{spacing.1}` inside a row, `{spacing.2}` between controls, `{spacing.4}` between sections side by side and `{spacing.6}` between sections one under another.

## Elevation & Depth

Three layers differ by tone: `{colors.surface-bar}` (the sidebar), `{colors.surface}` (the content column) and `{colors.surface-raised}` (inline panels). Sections are not boxed: a hairline under the heading groups them. Only floating layers, the menu and the tooltip, take a shadow: `0 0 0 1px {colors.hairline}, 0 8px 24px rgb(0 0 0 / 0.24), 0 2px 6px rgb(0 0 0 / 0.16)`, over a transparent 1 px border for forced colours.

## Shapes

Sidebar entries, rows, buttons and dice buttons use `{rounded.md}`. A value uses `{rounded.sm}`. The window, a menu and an inline panel use `{rounded.lg}`. Chips use `{rounded.full}`. Tabs have no shape: they are text with an underline. `{rounded.xl}` is kept for the preset builder.

## Element language

| Kind | Look | Elements |
| --- | --- | --- |
| Navigation | `{colors.text-muted}` and no fill at rest; `{colors.fill}` and `{colors.text}` under the pointer; `{colors.fill-strong}` and `{colors.text}` when selected | Sidebar entries, tabs (with an underline instead of a fill) |
| Editable value | `{components.value-ghost}`: no edge at rest, a `{colors.line}` edge under the pointer, `{colors.fill}` and the focus ring while edited. A device with no hover shows `{colors.fill}` at rest, because a tablet has no pointer to find the value with | Text, number and select fields, the sheet name, the duplicate count |
| Read-only value | The same box with a transparent edge | A player's view, a field with no write access |
| Row | `{colors.fill}` under the pointer, so the eye follows a row across a wide grid | Preset rows |
| Command | `{components.button-secondary}`, or `{components.button-primary}` for the main action | Buttons, the map toggle |
| Roll | `{components.dice-button}`, compact | Dice buttons |
| Status | `{components.chip}`, compact | Chips |
| Group | A `{components.section-heading}` over a hairline | Preset sections, Settings sections |

A compact control draws 24 px and keeps a 32 px touch target through a transparent layer above and below it. A pressed button scales to 0.96 over 150 ms with `ease-out`, only when the person has not asked for reduced motion.

## Components

| Component | Visual rule |
| --- | --- |
| Sidebar | `{components.sidebar}` with a `{colors.hairline}` right rule and `{spacing.2}` padding. Entries 1 px apart, in `{typography.body}` with `{components.sidebar-entry}`, padding-inline `{spacing.2}`, one line, cut short with an ellipsis. The active entry uses `{components.sidebar-entry-active}` in medium weight. A sheet set heading in `{typography.caption}` `{colors.text-muted}`. "+ Добавить" like an entry. A divider is a `{colors.hairline}` rule with `{spacing.2}` above and below. The Settings entry sits at the bottom, `{spacing.2}` from the edges, under a `{colors.hairline}` rule [ASSUMPTION] |
| Tab row | Under the sheet header, on `{colors.surface}`, over a `{colors.hairline}` rule. `{components.tab}` for each tab; the active tab uses `{components.tab-active}` in medium weight with a 2 px underline |
| Sheet header | Name or single sheet title in `{typography.sheet-title}`, the GM's icon controls after it, `{spacing.6}` above the first section, no rule. An editable name is a `{components.value-ghost}` |
| Header icons | In this order: token, "Доступ", "Удалить лист". Each is a 16 px outline icon in `{colors.text-muted}` with a 1.5 px stroke, in a 32 px square with `{rounded.md}`, `{colors.fill}` and `{colors.text}` under the pointer. A pressed one ("Доступ" while its panel is open, the token while its tokens are selected on the map) uses `{colors.accent-soft}`, a 40% `{colors.accent}` edge and `{colors.accent-ink}`. "Удалить лист" takes the danger pair under the pointer. The token icon is a diamond: struck through with no token, with a dot when linked; it is the "Выделить на карте" toggle while a linked token is on the open scene, and an image with the status as its name otherwise. Every icon shows its name in a tooltip on hover and focus |
| Field value | Arrangement comes from the preset. Rows do not stripe. An editable value is a `{components.value-ghost}` with padding-inline `{spacing.2}`; a read-only value keeps the same box |
| Pending mark | Text "Ожидает" in `{typography.label-sm}`, as the warning surface and text pair, after the value |
| Section | `{typography.section-heading}` in `{components.section-heading}`, `{spacing.2}` under the heading and above its rule. No box |
| Chip | `{components.chip}`, `{typography.caption}`, compact. A pressed chip uses `{components.chip-pressed}` with a 40% `{colors.accent}` edge |
| Dice button | `{components.dice-button}` with a 30% `{colors.accent}` edge, `{typography.label-sm}` in medium weight, compact |
| Menu | `{components.popover}` with the floating shadow and `{spacing.1}` padding. Items `{rounded.sm}`, `{colors.fill}` when focused |
| Tooltip | A cell name in `{typography.caption}` `{colors.text}` on `{colors.surface-raised}`, with the floating shadow, `{rounded.md}` and padding `{spacing.1}` `{spacing.2}`. One line up to the window width, then it wraps. It sits `{spacing.1}` above the control, or below it when there is no room above |
| Status banner | `{components.banner-warning}` or `{components.banner-danger}`, the width of the content column, at its top [ASSUMPTION] |
| Access panel, duplicate count, Confirmation | `{components.panel}`, inline |
| Repeat block | The block's rows, then its controls in `{typography.label-sm}`. Blocks after the first sit under a `{colors.hairline}` rule |
| Selection mark | On a sidebar entry or a tab, a 6 px `{colors.accent}` dot with `{rounded.full}` after the name and its mark. On a repeat block, a 3 px `{colors.accent}` bar on its left edge. An entry or a tab has no room for a word, and the accessible name carries it |
| Map toggle | "Выделить на карте" as `{components.button-secondary}`. Pressed: `{colors.accent-soft}` background, a 40% `{colors.accent}` edge and `{colors.accent-ink}` text |
| Settings | Sections like preset sections, `{spacing.6}` apart. First action `{components.button-primary}`, the others `{components.button-secondary}` |
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

- Do derive every colour from the Owlbear theme in every window. The builder follows its Owlbear theme copies.
- Do keep one look per kind of element (see Element language). A new control takes the look of its kind.
- Do keep controls quiet at rest. A control shows itself under the pointer, on focus, and on a device with no hover.
- Don't put the accent on navigation or headings. It marks a roll and the map selection.
- Do let the preset decide the arrangement of sheet content.
- Don't add colour coding for game concepts. The extension does not know what a stat means.
- Don't add icons where a word fits. The exceptions are the GM's header controls, each with a name and a tooltip.
