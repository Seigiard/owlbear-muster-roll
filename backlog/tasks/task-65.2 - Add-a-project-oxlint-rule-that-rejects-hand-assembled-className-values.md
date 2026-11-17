---
id: TASK-65.2
title: Add a project oxlint rule that rejects hand-assembled className values
status: Done
assignee:
  - '@openai'
created_date: '2026-11-14T20:48:00Z'
updated_date: '2026-11-14T22:24:00Z'
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
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The project-rule guard for TASK-65, after TASK-65.4. Oxlint 1.93 has no no-restricted-syntax, so this rule is a JavaScript plugin built with defineRule and eslintCompatPlugin from @oxlint/plugins, matching the API already used by tools/oxlint/anti-slop/rules/*.ts. It lives in its own tools/oxlint/muster-roll/ folder, outside vendored anti-slop, so install-anti-slop cannot overwrite it and the repository resolves @oxlint/plugins.

TASK-65.4 controls proved that better-tailwindcss/no-concatenated-classes rejects partial-token construction but leaves whole-class template interpolation and binary + construction. The local rule therefore covers all five direct forbidden className expression forms: a template literal with substitutions, binary +, a ConditionalExpression, a LogicalExpression with &&, and a call to .join(). Tailwind-specific validity and partial-token diagnostics remain owned by better-tailwindcss. Conditional branches inside clsx or cva remain valid; variant-map indexing belongs to TASK-65.3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A plugin folder under tools/oxlint/, outside anti-slop/, exports the rule, and the oxlint config lists it in jsPlugins and enables the rule as an error
- [x] #2 The rule reports a className built with template substitutions, binary +, a ternary, && or .join(), and passes a string literal, a static template, an identifier and a clsx or cva call
- [x] #3 The rule has a unit test with one failing and one passing fixture per forbidden branch
- [x] #4 bun run lint passes on the whole tree with the rule on
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement the smallest project plugin under tools/oxlint/muster-roll/ with defineRule and eslintCompatPlugin; report only direct className expressions that are template substitutions, binary +, ternary, &&, or .join().
2. Export the plugin, enable muster-roll/no-hand-assembled-classname as an error in .oxlintrc.json, and narrowly include tools/oxlint/muster-roll in tsconfig.json for static coverage without vendored anti-slop.
3. Add the focused implementation spec and preserve the locked real-CLI fixtures unchanged.
4. Run the locked rule test, format, lint, typecheck, full Bun suite, and the browser/build gates using unchanged TASK-65.4 evidence where valid; commit implementation/config separately from Backlog/spec documentation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reconciled with TASK-65.4 evidence at /Users/seigiard/.claude/artifacts/tdd-20261114-220152/65.4/controls/no-concatenated-residuals.log: partial-token construction is upstream-owned, but whole-class ${className ?? ""} interpolation and BASE_CLASS + " bg-fill" remain residuals. The implementation scope now adds those two branches while preserving the original ternary, && and .join() meanings and all task relationships.

Implementation and verification: production/config commit a3cf01e5d62a31b68fae56feca6a4ad634a75673 adds the defineRule rule, eslintCompatPlugin entry, error-level config, and narrow tools/oxlint/muster-roll tsconfig coverage. Locked owner test passed 10/10 at controls/final-rule-test-a3cf01e.log. Full format, lint and typecheck passed at controls/final-format-a3cf01e.log, controls/final-lint-a3cf01e.log and controls/final-typecheck-a3cf01e.log. Durable full bun test passed with 3019 pass, 1 skip and 0 fail at controls/final-bun-test-a3cf01e.log; its verdict recorded head a3cf01e5d62a31b68fae56feca6a4ad634a75673 and documentation-only dirty paths. The locked test remained byte-identical to lock_sha. Browser and build were reused from TASK-65.4 controls/final-browser-rerun.log and controls/final-build.log at unchanged state 70335faf78e806ec3a41708a859c2f1c53b8f4d8: no app source, dependency or generated runtime state changed. Vendored tools/oxlint/anti-slop remains excluded from tsconfig. Parent-owned post-green calibration is not claimed here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and verified muster-roll/no-hand-assembled-classname. The project rule rejects direct className template substitutions, binary +, ternary, && and .join() expressions while allowing literals, static templates, identifiers and clsx/cva composition. Config and narrow static type coverage are enabled outside vendored anti-slop. Locked, full Bun, format, lint and type checks passed; unchanged TASK-65.4 browser/build evidence was reused with state mapping. Production/config commit: a3cf01e5d62a31b68fae56feca6a4ad634a75673. Documentation commit follows separately. Post-green calibration remains parent-owned.
<!-- SECTION:FINAL_SUMMARY:END -->
