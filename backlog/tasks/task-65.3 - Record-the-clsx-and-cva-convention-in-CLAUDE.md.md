---
id: TASK-65.3
title: Record the clsx and cva convention in CLAUDE.md
status: Done
assignee:
  - '@openai'
created_date: '2026-11-14T20:48:00Z'
updated_date: '2026-11-14T22:39:00Z'
labels:
  - docs
dependencies:
  - TASK-65.1
references:
  - CLAUDE.md
parent_task_id: TASK-65
type: docs
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The written half of the TASK-65 guard. The lint rule catches string assembly in `className`, but it cannot tell a variant map indexed by a prop from ordinary property access, so the rule that a control with variants uses `cva` is a convention. CLAUDE.md carries it in an `<important if>` block for an agent that writes or changes UI components, next to the existing block about interface text. The block names `clsx` for ad-hoc conditional classes, `cva` for variants, and the lint rule that enforces the first, in one or two lines each. GLOSSARY.md is unaffected: `clsx` and `cva` are not domain terms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CLAUDE.md has an `<important if>` block for writing or changing UI components that names `clsx` for conditional classes, `cva` for variants, and the lint rule that enforces hand-assembled `className` values
- [x] #2 The block follows the `writing-for-agents` skill: short, imperative, no restating of what the lint already checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one short imperative <important if> block beside the interface-text guidance in CLAUDE.md; name clsx for conditional className assembly, cva for named variants, and the enforced muster-roll/no-hand-assembled-classname rule.
2. Write the focused implementation spec with the exact source-state and sibling-report evidence mapping.
3. Inspect both acceptance criteria, reuse unchanged checks with git diff coverage proof, and finalize TASK-65.3 through the Backlog CLI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented CLAUDE.md guidance beside the interface-text block. The new imperative block directs agents to use clsx for conditional className values, cva for named control variants, and muster-roll/no-hand-assembled-classname for the className assembly boundary. Added _bmad-output/implementation-artifacts/spec-65-3-class-conventions.md.

Validation evidence:
- Direct block inspection: CLAUDE.md lines 68-71; git diff --check exited 0.
- Temporary AST audit reused /Users/seigiard/.claude/artifacts/tdd-20261114-220152/65.1/controls/class-name-ast-audit.ts against current state 4458fd91709e7b6b367ed670fe6725c73e9cb280; output controls/class-name-ast-audit-current.json reports 262 targets and 0 violations, exit 0.
- Reuse mapping: TASK-65.2 own-rule, format, lint, typecheck and unit evidence remains valid from a3cf01e5d62a31b68fae56feca6a4ad634a75673 because all covered source/config/dependency paths are unchanged; controls/coverage-reuse.log records git diff exit 0. TASK-65.4 browser/build evidence remains valid from 9a92c21403c69eeaa47dc8df199ee86e6f344c22 because src, tests, public, package.json, bun.lock and .oxfmtrc.json are unchanged; later changes are only tool/config/docs paths.
- Empirical boundary: better-tailwindcss/no-concatenated-classes covers partial-token interpolation and + construction, while muster-roll/no-hand-assembled-classname covers all five prohibited direct assembly forms.
- No permanent tests or application/config/plugin changes were made.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded the UI className convention in CLAUDE.md. Agents now use clsx for conditional classes, cva for named control variants, and the project no-hand-assembled-classname rule. The focused spec and accepted reuse evidence are recorded; both acceptance criteria are checked.
<!-- SECTION:FINAL_SUMMARY:END -->
