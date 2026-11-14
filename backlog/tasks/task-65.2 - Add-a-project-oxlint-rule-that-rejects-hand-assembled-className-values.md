---
id: TASK-65.2
title: Add a project oxlint rule that rejects hand-assembled className values
status: To Do
assignee: []
created_date: '2026-11-14T20:48:00Z'
updated_date: '2026-11-14T20:56:00Z'
labels:
  - lint
dependencies:
  - TASK-65.1
  - TASK-65.4
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
The project-rule guard for TASK-65, after TASK-65.4. Oxlint 1.93 has no `no-restricted-syntax`, so a rule is a JS plugin on `defineRule` and `eslintCompatPlugin` from `@oxlint/plugins`, the API `tools/oxlint/anti-slop/rules/*.ts` already uses. It lives in its own folder, for example `tools/oxlint/muster-roll/`, not inside `tools/oxlint/anti-slop/`, which `install-anti-slop` overwrites from upstream, and inside the repository so it resolves `@oxlint/plugins`. Scope follows the notes of TASK-65.4: `better-tailwindcss/no-concatenated-classes` already rejects interpolation and `+` in a class string, so this rule covers only what that one leaves, a `className` whose expression is a `ConditionalExpression`, a `LogicalExpression` with `&&`, or a call to `.join`, so that the branch moves into `clsx`. If TASK-65.4 records that nothing is left, archive this task instead. The rule cannot see a variant map indexed by a prop; that convention lives in CLAUDE.md (TASK-65.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A plugin folder under `tools/oxlint/`, outside `anti-slop/`, exports the rule, and the oxlint config lists it in `jsPlugins` and enables the rule as an error
- [ ] #2 The rule reports a `className` built with a ternary, `&&` or `.join()`, and passes a string literal, an identifier and a `clsx` or `cva` call
- [ ] #3 The rule has a unit test with one failing and one passing fixture per branch
- [ ] #4 `bun run lint` passes on the whole tree with the rule on
<!-- AC:END -->
