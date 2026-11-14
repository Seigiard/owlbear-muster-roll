---
id: TASK-65.2
title: Add a project oxlint rule that rejects hand-assembled className values
status: To Do
assignee: []
created_date: '2026-11-14T20:48:00Z'
labels:
  - lint
dependencies:
  - TASK-65.1
references:
  - .oxlintrc.json
  - tools/oxlint/anti-slop/rules/no-conditional-empty-object-spread.ts
  - tools/oxlint/anti-slop/index.ts
parent_task_id: TASK-65
type: task
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The guard for TASK-65. Oxlint 1.93 has no `no-restricted-syntax`, so the rule is a JS plugin on `defineRule` and `eslintCompatPlugin` from `@oxlint/plugins`, the API `tools/oxlint/anti-slop/rules/*.ts` already uses. It lives in its own folder, for example `tools/oxlint/muster-roll/`, not inside `tools/oxlint/anti-slop/`, which `install-anti-slop` overwrites from upstream. The plugin must sit inside the repository so it resolves `@oxlint/plugins`. The rule visits `JSXAttribute` named `className` and reports an expression that is a template literal with substitutions, a `BinaryExpression` with `+`, a `ConditionalExpression`, a `LogicalExpression` with `&&`, or a call to `.join`. A string literal, an identifier and any other call (so `clsx(...)` and a `cva` variant function) pass. The rule cannot see a variant map indexed by a prop; that convention lives in CLAUDE.md. It depends on the migration subtask: enabled earlier it would fail on sixteen existing sites.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A plugin folder under `tools/oxlint/`, outside `anti-slop/`, exports the rule, and `.oxlintrc.json` lists it in `jsPlugins` and enables the rule as an error
- [ ] #2 The rule reports a `className` built with a template literal with substitutions, `+`, a ternary, `&&` or `.join()`, and passes a string literal, an identifier and a `clsx` or `cva` call
- [ ] #3 The rule has a unit test with one failing and one passing fixture per branch
- [ ] #4 `bun run lint` passes on the whole tree with the rule on
<!-- AC:END -->
