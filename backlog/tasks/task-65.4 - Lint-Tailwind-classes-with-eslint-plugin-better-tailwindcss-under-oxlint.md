---
id: TASK-65.4
title: Lint Tailwind classes with eslint-plugin-better-tailwindcss under oxlint
status: Done
assignee:
  - '@openai'
created_date: '2026-11-14T20:55:00Z'
updated_date: '2026-11-14T23:10:00Z'
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
- [x] #1 The plugin is a pinned dev dependency, listed in `jsPlugins` of the oxlint config, with `entryPoint` at `src/ui/main.css`, and the eight chosen rules are on at the severities above
- [x] #2 The `*_CLASS` constants in `src/ui` are linted: a deliberate unknown class in one of them fails `bun run lint`
- [x] #3 `sortTailwindcss` is on in `.oxfmtrc.json`, the tree is reformatted once, and `bunx oxfmt --check` passes
- [x] #4 `bun run lint` passes on the whole tree with the rules on, and the lint run time is recorded in the notes
- [x] #5 The notes state what TASK-65.2 still has to cover after `no-concatenated-classes`, or that TASK-65.2 can be archived
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the upstream eslint-plugin-better-tailwindcss oxlint configuration, parser defaults, and the project’s actual UI class surfaces.
2. Add the pinned dev dependency, configure the CSS entryPoint, exact eight selected rules, *_CLASS variable matching, and enable oxfmt Tailwind sorting; run the one-time formatter and fix only relevant diagnostics.
3. Use temporary controls to prove unknown *_CLASS diagnostics and probe TASK-65.2 residual constructs, restoring all mutations.
4. Run the six final project checks under supervision, record command/state/output evidence and lint duration, create the focused spec and task notes, then commit implementation separately from documentation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation commit: `9a92c21403c69eeaa47dc8df199ee86e6f344c22`. Added
`eslint-plugin-better-tailwindcss@4.11.0`, configured the eight selected rules
with `src/ui/main.css` and the `^.*_CLASS$` selector, enabled
`sortTailwindcss`, and applied the one-time formatter. The two source
adjustments preserve behavior under the project theme reset: `w-20` became
`w-[5rem]`, and the `full` width fallback is resolved before `clsx`.

The final checks were run against the implementation state before the commit;
the commit hook also reran format and lint on the committed tree:

- `bunx oxfmt --ignore-path .gitignore --check .`: exit 0, 0.21s.
- `bun run lint`: exit 0, 185 warnings, 0 errors, 3.27s.
- `bun run typecheck`: exit 0, 0.60s.
- `bun test`: exit 0, 3009 passed, 1 skipped, 0 failed, 52.05s.
- `bun run test:browser`: the first run recorded one selection focus failure
  at `tests/selection.e2e.ts:150` after 519 passed. The unchanged supervised
  rerun passed 520 tests in 2.9m; no test or expectation changed.
- `bun run build`: exit 0; Vite built 1674 modules in 337ms. The existing
  `advancedChunks` deprecation warning remains.

Full command and output evidence is under
`/Users/seigiard/.claude/artifacts/tdd-20261114-220152/65.4/controls/`,
including separate first-run and rerun browser logs and `final-build.log`.
Temporary controls were restored. `no-concatenated-classes` rejects partial
token interpolation and `+`; TASK-65.2 must still cover whole-class
interpolation and `+`, direct ternary, `&&`, and `.join()` forms.

Review correction after round 1 (arch+quality-claude-1 and adversarial-claude-1), committed in 74ec9c3859dfbd677b912d58fb0f15bc08faf311: .oxfmtrc.json now uses the schema-supported sortTailwindcss object with stylesheet src/ui/main.css and functions clsx/cva; affected source was reformatted once. The formatter control at formatter-theme-functions-control-retry.log shows project tokens and clsx/cva strings are reached. The upstream schema has no variable matcher for static *_CLASS constants, so they remain lint-validated and are not wrapped in runtime calls. duplicate-count.tsx now removes the newly effective w-[5rem]; the original w-20 generated no CSS under the project theme, and the real built-CSS Chrome control at 65-1-width-control-retry.log measured the no-width and original w-20 forms equally at 193px. The first standalone width control failed because the Playwright-managed executable was absent; the Chrome retry passed. Fresh controls on source candidate 74ec9c3859dfbd677b912d58fb0f15bc08faf311: owner 10/10, format 340 files, lint 185 warnings/0 errors, typecheck pass, unit 3019 pass/1 skip, browser 520 pass, build 1674 modules/exit 0. Locked owner test stayed byte-identical to lock_sha 14f75d8d252f2be905d35af29678ad21f16f95be.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented TASK-65.4 in `9a92c21403c69eeaa47dc8df199ee86e6f344c22`.
Tailwind class correctness and style checks now run under oxlint, named
`*_CLASS` constants are included, and oxfmt sorts Tailwind classes. The full
verification set passed except for one non-reproduced selection focus failure
on the first browser run; the unchanged rerun passed 520/520.

Review correction is complete in 74ec9c3859dfbd677b912d58fb0f15bc08faf311. Formatter sorting now uses the project stylesheet and clsx/cva functions; duplicate-count preserves the original intrinsic width by removing w-[5rem]. The truthful fresh verification is recorded under the TASK-65 run controls, with browser 520/520 and build exit 0. Status remains Done.
<!-- SECTION:FINAL_SUMMARY:END -->
