---
id: TASK-61.11
title: Extract preset-upload confirmation transitions into a pure reducer
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T14:37:00Z'
updated_date: '2026-11-14T16:55:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies: []
references:
  - TASK-61.10
  - src/ui/preset-actions.tsx
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
parent_task_id: TASK-61
type: task
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-61.10. The wipe probe showed that a flow-specific pure reducer creates direct transition seams without moving command or browser effects out of the component. Apply that validated local boundary to the preset-upload confirmation flow in src/ui/preset-actions.tsx. The evidence is the locked reducer test src/ui/settings/wipe-actions-reducer.test.ts, its focused command, and calibration-2 regression results; use it as a boundary decision, not as a reason to build shared machinery. This task is intentionally unimplemented and must remain To Do until started.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The preset-upload confirmation flow has a flow-specific pure reducer with direct transition coverage, while src/ui/preset-actions.tsx owns useReducer.
- [x] #2 The component keeps preset-upload command dispatch and browser effects, including refocus; the reducer has no React or DOM dependency.
- [x] #3 No generic or shared settings-flow or upload framework or helper is introduced.
- [x] #4 Existing preset-upload browser behavior remains covered by its applicable unchanged browser tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research the existing preset-upload transitions, applicable browser tests, TASK-61.10 evidence, and ADR-0002; retain the small reversible oneshot boundary in _bmad-output/implementation-artifacts/spec-task-61.11-preset-upload-confirmation.md.
2. Extract the pure preset-upload reducer and wire useReducer in src/ui/preset-actions.tsx, creating the callable seam while keeping command dispatch, file reading, async settlement effects, browser refocus, and the applicable browser tests unchanged. Run the checks-only bootstrap against those unchanged browser tests.
3. Prepare and lock direct reducer preservation tests at the callable flow-specific seam after the bootstrap; keep the locked test path byte-identical during implementation.
4. Calibrate each direct transition assertion with a faithful red mutation and restored green result. Run the focused reducer tests and all six repository gates: bunx oxfmt --ignore-path .gitignore --check ., bun run lint, bun run typecheck, bun test, bun run test:browser, and bun run build.
5. Review the implementation, address valid findings within scope, record evidence and deliberate deferrals, and finalize the spec and task only after acceptance is verified.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final evidence at runtime commit 79b2332cd3e6fc997b087151d483608cc60108fd: the flow-specific reducer owns transitions; the component retains useReducer, commands, file reading, async cleanup, and refocus. No shared framework was introduced. The locked reducer test remains byte-identical to 5ccb8a15c9006d471509a63bda2784f7ee6f91b2. All 19 direct tests independently failed at exact-owner assertions under faithful mutations; the restored suite passed all 19. tests/ is unchanged.

Six gates passed on unchanged runtime/test source: format; lint (170 warnings, 0 errors, including one new boundary-test warning); typecheck; unit (2966 pass, 1 environment skip); full browser (519 pass, including applicable unchanged upload tests); build. Earlier focused upload browser run: 48 pass. Closeout reruns full format and reuses the other completed checks. Mock results do not prove live Owlbear behavior; no platform or deployment change.

Final review: focused profile, narrowed from default mixed for the local residual gap; exit 0. Both expected sources, bugs and adversarial, reported 0 raised; no degraded sources, findings, open questions, pre-existing findings, or immaterial findings. Parent verified successful tool reads and actual inspection trails. CSS review was skipped because markup/classes were unchanged.

Bootstrap Blind Hunter: F1 fixed by releasing the zero-loss handoff reference outside send. F2 deliberately deferred as a source-backed, pre-existing overlapping-file-read candidate, not a reproduced defect or observed incident; the existing deferred-work entry is not duplicated. F3 rejected: zero-loss focus is unverified/pre-existing; no browser observation demonstrates focus loss. F4 rejected: a throwing send stub constructs a hypothetical path; no normal synchronous failure was shown. No follow-up task was created or started.

Documentation closeout: full format check passed across 331 files. Frozen Intent is byte-identical; source, tests/, locked test, and deferred-work.md are unchanged by closeout. Only this task and its spec changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Preset-upload confirmation now has a pure, flow-specific reducer, so transitions can be tested directly without moving commands or browser effects out of the component. Existing browser tests remain unchanged. All 19 direct tests were independently mutation-red and restored green; six repository gates passed, including 2966 unit tests and 519 browser tests. Lint has 170 warnings and 0 errors, including one new boundary-test warning. The existing overlapping-file-read candidate remains deliberately deferred as pre-existing, without a reproduced incident. No follow-up task was created or started. Mock coverage does not prove live Owlbear behavior.
<!-- SECTION:FINAL_SUMMARY:END -->
