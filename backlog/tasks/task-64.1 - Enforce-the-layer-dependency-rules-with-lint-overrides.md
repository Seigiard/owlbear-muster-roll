---
id: TASK-64.1
title: Enforce the layer dependency rules with lint overrides
status: Done
assignee:
  - '@seigiard'
created_date: '2026-11-14T20:25:00Z'
updated_date: '2026-11-14T21:38:00Z'
labels:
  - architecture
  - layer-boundaries
dependencies: []
parent_task_id: TASK-64
type: task
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The ARCHITECTURE-SPINE diagram says core depends on nothing, replica and ui depend on core and ports, platform depends on core, and builder depends on core and the sheet components of ui. Only the Owlbear SDK import is enforced today (`.oxlintrc.json`, `no-restricted-imports`). Two leaks already exist: `src/replica/background-main.ts` imports `@/ui/copy`, and `src/replica/room-rig.ts` imports two ui modules. The copy module is interface text used by both the window and the background page, so its home under `src/ui` contradicts the layer; it moves out as part of this task. The rig move is TASK-64.2, next in order; this task gives `room-rig.ts` one explicit file-level exemption that TASK-64.2 removes. Oxlint supports per-path `overrides` with their own `no-restricted-imports` patterns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Lint fails when a module under `src/core` imports from `@/platform`, `@/replica`, `@/ui`, `@/builder`, `@/preview`, `react` or `react-dom`
- [x] #2 Lint fails when a module under `src/replica` imports from `@/ui`, `@/builder` or `@/preview`; `src/replica/room-rig.ts` carries the only exemption, with a comment naming the task that removes it
- [x] #3 Lint fails when a module under `src/platform` imports from `@/replica`, `@/ui`, `@/builder` or `@/preview`
- [x] #4 Lint fails when a module under `src/builder` imports from `@/replica` or `@/platform`
- [x] #5 Interface text lives outside `src/ui` and every former importer of `@/ui/copy` compiles; CLAUDE.md names the new path
- [x] #6 Each rule has a negative check: a scratch file with a forbidden import makes `bun run lint` fail, recorded in the implementation notes
- [x] #7 The full check passes: format, lint, typecheck, `bun test`, `bun run test:browser`, build
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add per-layer no-restricted-imports overrides in .oxlintrc.json while preserving the SDK and direct-adapter restrictions, with the documented room-rig exemption for TASK-64.2.
2. Move interface copy from src/ui/copy.ts to src/copy.ts, update all production/test/e2e imports mechanically, and name the shared path in CLAUDE.md.
3. Exercise each layer rule with temporary forbidden-import scratch files and allowed-import controls through bun run lint; record exact state, commands, statuses and diagnostics under the TDD run directory.
4. Run the required format, lint, typecheck, unit, browser and build checks, commit the implementation by concern, and publish the implementation report.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation evidence at commit 90d797e59ce762e4a5bd2c0fcacf1d07c2a00c19: .oxlintrc.json now enforces core, replica, platform and builder dependency restrictions; SDK and direct-adapter restrictions remain active; src/ui/copy.ts moved verbatim to src/copy.ts and all importers plus CLAUDE.md were updated; room-rig.ts has the sole TASK-64.2 exemption comment.

Controls under /Users/seigiard/.claude/artifacts/tdd-20261114-213052/64.1/controls/ ran temporary forbidden imports through bun run lint: core, replica, platform, builder, SDK and adapter negative cases all exited 1 with no-restricted-imports; positive controls exited 0, including SDK use from src/platform/obr. Scratch files were removed.

Required checks passed with exit 0: bunx oxfmt --ignore-path .gitignore --check ., bun run lint, bun run typecheck, bun test (3009 passed, 1 skipped), bun run test:browser (520 passed), and bun run build. The commit hook also passed format and lint. Parent owns the post-chain code review; this task remains In Progress until that review closes.

D1 review fix: removed the wildcard replica test exclusion. The five existing replica tests now use the sanctioned room-rig exports/types for UI client capabilities without changing assertions or test names. Controls at /Users/seigiard/.claude/artifacts/tdd-20261114-213052/64.1/controls/d1-before-* reproduce the pre-fix failure and d1-replica-test-*.log reject temporary UI, builder and preview .test.ts probes while d1-room-rig-exception.log confirms the sole exception.

D1 verification: corrected-state format, lint, typecheck, unit (3010 tests) and build passed under controls/d1-{format,lint,typecheck,unit,build}.*. The first unchanged-state browser run had one selection.e2e.ts timeout (519 passed); the unchanged-state retry passed all 520 tests under controls/d1-browser-retry.*. No production runtime code changed.

Closeout: review 02-after-fix completed with 2/2 healthy sources, zero critical/major findings and no open questions. Parent verified 3009 unit passes plus 1 skip and 520 browser passes on the unchanged-state retry. The task is now Done; TASK-64.2 and TASK-64.3 remain parent-managed follow-ups.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-64.1 is done. D1 is corrected: the wildcard replica-test exclusion was removed, and the five cross-layer tests route UI test capabilities through the sole room-rig exemption without changing assertions. Scratch lint probes reject forbidden imports. Final format, lint, typecheck, 3010 unit tests, build and the unchanged-state 520-test browser retry passed; the first browser run had one unrelated selection timeout and was retried successfully. TASK-64.2 remains the follow-up for moving room-rig.ts; three review polish items are deferred in deferred-work.md, and the permanent lint inventory was rejected because AC6 has no local oracle for it.
<!-- SECTION:FINAL_SUMMARY:END -->
