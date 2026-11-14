---
id: TASK-65
title: Build className with clsx and cva and lint hand-made class strings
status: To Do
assignee: []
created_date: '2026-11-14T20:47:00Z'
labels:
  - ui
  - lint
dependencies: []
references:
  - .oxlintrc.json
  - tools/oxlint/anti-slop/index.ts
  - src/ui/primitives/button.tsx
  - https://github.com/lukeed/clsx
  - https://cva.style
type: enhancement
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sixteen places in `src/ui` assemble `className` by hand: template literals with `${className ?? ""}`, ternaries inside the string (`Chip`, `IconButton`, `DiceButton`), and const maps of variants indexed by a prop (`Button`, `Banner`). It works, but each new control repeats the pattern a little differently, and nothing stops the next one from doing the same. Emil Kowalski's curated list (the `pick-ui-library` skill) names `clsx` for ad-hoc conditional classes and `cva` for typed variants on Tailwind; both are tiny and compose. Review on 2026-11-14 found no other library from that list worth adopting here: react-aria-components, nanostores, Owlbear notifications and the inline confirmation blocks are deliberate choices recorded in `_bmad-output/specs/spec-muster-roll/stack.md`, the architecture spine and the UX design rules. Oxlint 1.93 has no `no-restricted-syntax` (checked: the config fails to parse with it), so the guard is a project JS plugin rule in the style of `tools/oxlint/anti-slop/`, kept outside that vendored folder because `install-anti-slop` overwrites it. A prototype of the rule exists in the review session; its logic: a `className` JSX attribute whose expression is a template literal with substitutions, a `+` concatenation, a ternary, an `&&`, or a `.join()` call is an error. A variant map such as `VARIANT_CLASS[variant]` is plain property access and the lint cannot tell it from legitimate code, so the move of variants to `cva` stays a written convention, in CLAUDE.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every `className` in `src/ui`, `src/builder` and `src/preview` is a string literal, a constant, or a `clsx`/`cva` call; no template literal with substitutions, `+`, ternary, `&&` or `.join()` builds one
- [ ] #2 A project oxlint JS plugin outside `tools/oxlint/anti-slop/` reports hand-assembled `className` values, is enabled as an error in `.oxlintrc.json`, and `bun run lint` passes on the whole tree
- [ ] #3 CLAUDE.md tells an agent that `className` is built with `clsx`, that a control with variants uses `cva`, and that the lint rule enforces the first
- [ ] #4 The full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
<!-- AC:END -->
