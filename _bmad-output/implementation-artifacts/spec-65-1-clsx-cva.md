# TASK-65.1: clsx and cva class assembly

## Scope

Replace hand-assembled `className` values in `src/ui`, `src/builder`, and
`src/preview` with `clsx`. Move the `Button`, `Chip`, `IconButton`, and
`Banner` variant families to `class-variance-authority` (`cva`).

This refactor keeps the public component props, accessibility props, default
states, class token order, Tailwind utility literals, and rendered behavior.
Tests and their expectations are unchanged. The TASK-65 lint rule is out of
scope.

## Code map

- `package.json`, `bun.lock`: pinned `class-variance-authority@0.7.1` and
  `clsx@2.1.1`.
- `src/ui/primitives/button.tsx`: typed `variant` cva definition and clsx
  assembly in `Pressable`.
- `src/ui/primitives/chip.tsx`: cva status, default, and pressed families.
- `src/ui/primitives/icon-button.tsx`: cva neutral, danger, and pressed
  families, with pressed taking precedence.
- `src/ui/primitives/banner.tsx`: cva warning and danger families; an empty
  Banner still has no `class` attribute.
- `src/ui/sheet/preset-section.tsx`, `src/ui/sheet/map-toggle.tsx`,
  `src/ui/sheet/sheet-header.tsx`, `src/ui/sheet/dice-button.tsx`,
  `src/ui/shell/window-frame.tsx`, `src/ui/primitives/tooltip.tsx`, and
  `src/ui/preset-actions.tsx`: `clsx` for conditional and intermediate class
  assembly.
- `src/builder/builder-page.tsx`, `src/builder/formula-input.tsx`, and
  `src/builder/item-form.tsx`: `clsx` for builder class combinations.

## Implementation

`cva` owns the named variant class strings for the four primitives. Existing
callers continue to pass `Button` variants, `Chip` pressed state, and
`IconButton` tone/pressed props. `IconButton` selects the pressed cva variant
before tone, so a pressed danger button does not retain danger hover classes.

`clsx` replaces template literals and array joins used to form class values.
Every Tailwind utility remains a complete literal token in source. The
`WindowFrame` fallback class keeps its existing position in the rendered list.

## Validation

- Original-state behavior control: `controls/class-token-control.tsx` reads
  expected literals from start SHA
  `467e1b28295c27477735e27a33645f148db5a91c`, renders the final primitives,
  and compares token lists for Button, Chip, IconButton, and Banner states.
- Source-shape control: `controls/class-name-ast-audit.ts` parses all TypeScript
  files under the three source directories and rejects template
  substitutions, `+`, `&&`, ternaries, and `.join()` in className values.
- Repository checks and their logs are recorded under `controls/checks/` by
  `controls/run-full-checks.sh`.

## Limits

The behavior control covers the four primitive families and their existing
state combinations. It does not independently render every page-level
`clsx` call; the unchanged unit and browser suites cover those consumers.
No permanent test or lint rule is added by this task.
