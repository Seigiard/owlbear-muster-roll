---
id: TASK-65
title: Build className with clsx and cva and lint hand-made class strings
status: Done
assignee: []
created_date: '2026-11-14T20:47:00Z'
updated_date: '2026-11-14T23:10:00Z'
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
- [x] #1 Every `className` in `src/ui`, `src/builder` and `src/preview` is a string literal, a constant, or a `clsx`/`cva` call; no template literal with substitutions, `+`, ternary, `&&` or `.join()` builds one
- [x] #2 A project oxlint JS plugin outside `tools/oxlint/anti-slop/` reports hand-assembled `className` values, is enabled as an error in `.oxlintrc.json`, and `bun run lint` passes on the whole tree
- [x] #3 CLAUDE.md tells an agent that `className` is built with `clsx`, that a control with variants uses `cva`, and that the lint rule enforces the first
- [x] #4 The full check passes: oxfmt, lint, typecheck, bun test, test:browser, build
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Epic closeout evidence:
- All four child tasks were inspected through the Backlog CLI and are Done: TASK-65.1, TASK-65.2, TASK-65.3, and TASK-65.4. No sibling task record was edited.
- AC1: the current temporary AST audit at state 4458fd91709e7b6b367ed670fe6725c73e9cb280 scanned 262 className targets in src/ui, src/builder, and src/preview and reported 0 violations in 65.3/controls/class-name-ast-audit-current.json. The accepted TASK-65.1 report and source classes show cva for Button, Chip, IconButton, and Banner and clsx for composed class lists.
- AC2: .oxlintrc.json registers tools/oxlint/muster-roll/index.ts and enables muster-roll/no-hand-assembled-classname as error; the rule source covers template substitutions, +, ternary, &&, and .join(). TASK-65.2 controls/final-rule-test-a3cf01e.log records 10 pass, and final-lint-a3cf01e.log records the whole-tree lint pass.
- AC3: CLAUDE.md lines 68-71 provide the short imperative clsx/cva/rule convention; TASK-65.3 is Done with both criteria checked.
- AC4: accepted TASK-65.2 evidence covers format, lint, typecheck, and bun test at a3cf01e5d62a31b68fae56feca6a4ad634a75673. Accepted TASK-65.4 evidence covers browser (520 passed) and build (exit 0), mapped by its report to source state 9a92c21403c69eeaa47dc8df199ee86e6f344c22. 65.3/controls/coverage-reuse.log records git diff exit 0 for all covered paths; no unchanged browser/build suites were rerun.
- Empirical boundary: better-tailwindcss/no-concatenated-classes covers partial-token interpolation and + construction, while muster-roll/no-hand-assembled-classname covers all five prohibited direct assembly forms, including whole-class interpolation and +.
- Parent-owned mutation calibration and cumulative review remain for the parent workflow; no GitHub issue number was added.

Post-review correction for TASK-65: commit 74ec9c3859dfbd677b912d58fb0f15bc08faf311 points oxfmt at src/ui/main.css and sorts clsx/cva strings, while static *_CLASS constants remain lint-validated because the upstream schema has no variable matcher. It also removes duplicate-count's w-[5rem]: the original w-20 had no generated CSS and a real Chrome control measured the no-width and original forms equally at 193px. Fresh final evidence is under /Users/seigiard/.claude/artifacts/tdd-20261114-220152/controls: owner 10/10, format, lint (185 warnings/0 errors), typecheck, unit 3019/1 skip, browser 520/520 and build 1674 modules all passed. Status remains Done.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed TASK-65 after all four child tasks reached Done. The UI now uses clsx/cva conventions, the project rule rejects direct hand-assembled className forms, Tailwind linting is configured, and accepted full-check evidence is preserved with explicit source-state reuse mapping.

Review correction commit 74ec9c3859dfbd677b912d58fb0f15bc08faf311 fixes project-aware oxfmt sorting and preserves duplicate-count's original intrinsic width. Fresh owner, format, lint, typecheck, unit, browser and build checks passed; statuses remain Done.
<!-- SECTION:FINAL_SUMMARY:END -->
