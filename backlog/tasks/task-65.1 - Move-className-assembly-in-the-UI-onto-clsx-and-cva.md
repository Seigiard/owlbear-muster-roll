---
id: TASK-65.1
title: Move className assembly in the UI onto clsx and cva
status: Done
assignee:
  - '@openai'
created_date: '2026-11-14T20:47:00Z'
updated_date: '2026-11-14T21:29:00Z'
labels:
  - ui
dependencies: []
references:
  - src/ui/primitives/button.tsx
  - src/ui/primitives/chip.tsx
  - src/ui/primitives/icon-button.tsx
  - src/ui/primitives/banner.tsx
  - src/ui/sheet/map-toggle.tsx
parent_task_id: TASK-65
type: task
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first slice of TASK-65. `clsx` and `cva` enter `package.json`. The four primitives in `src/ui/primitives` (`Button`, `Chip`, `IconButton`, `Banner`) get their variants through `cva`, so a caller picks a variant by a typed name and the class strings live in one place. The other `className` sites in `src/ui`, `src/builder` and `src/preview` that join strings or branch inside a template literal move to `clsx`. Tailwind 4 scans literal class names, so every class stays written out whole, as the comments in `map-toggle.tsx` already require. The lint rule (sibling task) turns the old form into errors, so it lands only after or together with this one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `clsx` and `cva` are dependencies with pinned versions
- [x] #2 `Button`, `Chip`, `IconButton` and `Banner` express their variants through `cva`, and callers choose a variant by name
- [x] #3 No `className` in `src/ui`, `src/builder` or `src/preview` is a template literal with substitutions, a `+` concatenation, a ternary, an `&&` or a `.join()`
- [x] #4 Rendered class lists are unchanged: e2e tests and unit tests pass without changes to their expectations
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin clsx and cva dependencies in package metadata without changing existing dependency versions.
2. Audit className assembly across src/ui, src/builder, and src/preview, then convert the four primitives to typed cva variant APIs and all remaining hand assembly to clsx while preserving literal Tailwind tokens and rendered precedence.
3. Add the focused implementation spec and temporary controls that compare start_sha class tokens and audit forbidden source forms.
4. Run the six repository checks plus controls, finalize the Backlog task through the CLI, and commit implementation separately from task/spec documentation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation commit: 1f964da2056ae261e87b246f98bed7ec554fb79c. Added pinned class-variance-authority@0.7.1 and clsx@2.1.1, converted four primitive variant families to cva, and replaced hand-built className assembly across the three source directories with clsx. Temporary controls are under the run directory controls/; full verification is running.

Verification complete at final state 3ab1ef2f3b87f3e60d092717e811abab977324c9. Final format, lint, typecheck and unit evidence: controls/checks/final-format.result, final-lint.result, final-typecheck.result, final-unit.result (all exit 0). Browser retry evidence: controls/checks/browser-retry.result and browser-retry.log (520 passed, exit 0). Build evidence: controls/checks/build.result and build.log (exit 0). Source controls: controls/class-name-ast-audit.json (262 className targets, 0 violations) and controls/class-token-control.json (start SHA 467e1b28295c27477735e27a33645f148db5a91c, 11 primitive state comparisons, empty Banner has no class attribute). The first browser run remains recorded in controls/checks/browser.log: 519 passed and one non-reproduced focus assertion failure at tests/open.e2e.ts:307; no focus code changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented TASK-65.1 in 1f964da2056ae261e87b246f98bed7ec554fb79c and documented it in 3ab1ef2f3b87f3e60d092717e811abab977324c. Pinned class-variance-authority@0.7.1 and clsx@2.1.1, moved the four primitive variant families to typed cva definitions, and replaced hand-built className assembly across src/ui, src/builder, and src/preview. Final format, lint, typecheck, unit, browser, build, AST, and original-state token controls pass. The first browser run had one focus failure (519/520); a supervised full rerun passed 520/520, so it was not reproduced and no test or focus behavior was changed.
<!-- SECTION:FINAL_SUMMARY:END -->
