---
id: TASK-65.4
title: Lint Tailwind classes with eslint-plugin-better-tailwindcss under oxlint
status: To Do
assignee: []
created_date: '2026-11-14T20:55:00Z'
labels:
  - lint
  - ui
dependencies:
  - TASK-65.1
references:
  - https://github.com/schoero/eslint-plugin-better-tailwindcss
  - >-
    https://github.com/schoero/eslint-plugin-better-tailwindcss/blob/main/docs/parsers/tsx.md
  - .oxlintrc.json
  - .oxfmtrc.json
  - src/ui/main.css
parent_task_id: TASK-65
type: task
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The second guard of TASK-65, before the project rule in TASK-65.2. Nothing checks the classes themselves today: a typo such as `bg-fill-strng`, a class from the default palette that `--*: initial` in `src/ui/main.css` removed, or `px-2 px-3` on one element all pass typecheck and tests and do nothing. `eslint-plugin-better-tailwindcss` (schoero) is declared an ESLint/Oxlint plugin; `docs/parsers/tsx.md` shows the oxlint form: the package name in `jsPlugins` and its rules in `rules`, with `entryPoint` pointed at `src/ui/main.css` so the plugin knows the project `@utility` and `@theme` tokens. Review on 2026-11-14 chose the set: correctness `no-unknown-classes`, `no-conflicting-classes`, `no-concatenated-classes`; stylistic `no-duplicate-classes`, `no-unnecessary-whitespace`, `no-deprecated-classes`, `enforce-canonical-classes` (as a warning; it covers `enforce-shorthand-classes`, `enforce-consistent-important-position` and `enforce-consistent-variable-syntax`, which stay off) and `enforce-consistent-variant-order`. Off: `enforce-consistent-class-order` and `enforce-consistent-line-wrapping`, because class order is the formatter's job (`sortTailwindcss` in `.oxfmtrc.json`, currently off) and wrapping conflicts with oxfmt; `enforce-logical-properties`, because the interface is Russian only and it renames `w-*` to `inline-*`; `no-restricted-classes`, as there is nothing to restrict yet. The plugin lints `className` and `clsx`/`cva` calls by default; the `*_CLASS` constants outside JSX need a variable matcher by name, or half the classes stay unchecked. `no-concatenated-classes` rejects interpolation and `+` in a class string, which overlaps TASK-65.2; this task records what that rule still has to cover (ternary, `&&`, `.join()`) or that it is not needed. It depends on TASK-65.1: `no-concatenated-classes` fails on the sixteen existing template literals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The plugin is a pinned dev dependency, listed in `jsPlugins` of the oxlint config, with `entryPoint` at `src/ui/main.css`, and the eight chosen rules are on at the severities above
- [ ] #2 The `*_CLASS` constants in `src/ui` are linted: a deliberate unknown class in one of them fails `bun run lint`
- [ ] #3 `sortTailwindcss` is on in `.oxfmtrc.json`, the tree is reformatted once, and `bunx oxfmt --check` passes
- [ ] #4 `bun run lint` passes on the whole tree with the rules on, and the lint run time is recorded in the notes
- [ ] #5 The notes state what TASK-65.2 still has to cover after `no-concatenated-classes`, or that TASK-65.2 can be archived
<!-- AC:END -->
