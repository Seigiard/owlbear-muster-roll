---
id: TASK-64.8
title: Take dev-only preview code out of the shipped builder page
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-14T20:26:00Z'
updated_date: '2026-11-15T07:22:00Z'
labels:
  - architecture
  - builder
dependencies:
  - TASK-64.1
parent_task_id: TASK-64
type: task
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CLAUDE.md and the spine's file tree call `src/preview` dev-only, but `src/builder` (a production entry in `vite.config.ts`, AD-20) imports `@/preview/themes` in three files and `@/preview/stub-rolling` in `preview-pane.tsx`, and AD-20 itself lists `src/preview` among the builder's imports, so the spine contradicts its own tree. Either the two modules belong to the shared UI (`src/ui`), or preview is a shared module and the docs say so; AD-20 changes with the choice. The two modules are small (`themes.ts` 20 lines, `stub-rolling.ts` 12 lines). Validation on 2026-11-15 also found that `src/ui` is the one layer with no lint override: a probe file in `src/ui` importing `@/replica/engine` and `@/preview/themes` passed `bun run lint`, so the spine's UI edges hold by discipline only. This task adds that override, the way TASK-64.1 added the others. Small task; it sits after the lint rules so the choice can be locked by a rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No module under `src/builder` imports from `@/preview`, or CLAUDE.md and the spine declare `src/preview` a shared module and the lint override allows exactly that; AD-20 lists the builder imports as the code has them after this task
- [x] #2 A lint override for `src/ui/**` forbids imports from `@/replica`, `@/builder` and `@/preview`, and a scratch file with each forbidden import makes `bun run lint` fail, recorded in the implementation notes
- [x] #3 `bun run build` output for the builder page is unchanged in behavior: themes and stub rolling work in the builder preview
- [x] #4 The full check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move src/preview/themes.ts and src/preview/stub-rolling.ts verbatim into src/ui; update builder and preview importers.
2. Add the src/ui/** Oxlint override forbidding @/replica, @/builder and @/preview while retaining existing SDK and adapter restrictions.
3. Reconcile AD-20 with the resulting builder import graph.
4. Run temporary lint probes, full format/lint/typecheck/unit/browser/build checks, and a built builder-page browser smoke check; capture evidence and remove probes.

5. Batch 2: prove the builder preview alias is accepted before the config change, add @/preview and @/preview/** to the builder restriction, and prove the same probe is rejected while allowed builder UI imports remain accepted.
6. Correct only active DESIGN.md themes references and AD-20 src/copy.ts wording; preserve historical memlogs/spec narratives.
7. Record the two deferred review findings and smoke callback limit in current workflow notes, rerun format/lint, write the atomic report, and commit without closing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the parent-selected move-to-shared-UI path. Moved themes.ts and stub-rolling.ts verbatim from src/preview to src/ui; rewired builder and standalone preview importers; added the src/ui/** no-restricted-imports override for @/replica, @/builder and @/preview while retaining SDK and direct-adapter rules; reconciled AD-20 in the architecture spine.

Controls under /Users/seigiard/.claude/artifacts/tdd-20261115-073040/TASK-64.8/controls/ recorded the temporary probes: UI replica, builder, preview, SDK and direct-adapter imports exited 1 with no-restricted-imports; allowed core/UI/platform-port and SDK from src/platform/obr exited 0; probes were removed. The built-output smoke served dist, observed DARK -> LIGHT, settled a dice cell with no rolling/error message, recorded zero browser errors, and left port 4173 free.

Final evidence on the dirty state based on 33804c44065fc760f652d4fb2bb5a5248bc8708d: format exit 0, lint exit 0, typecheck exit 0, bun test 3029 pass / 1 skip / 0 fail, browser 521 passed, and build exit 0. Final review is recorded in the Review Triage Log; task is ready for closure.

Batch 2 R1 control: `/Users/seigiard/.claude/artifacts/tdd-20261115-073040/TASK-64.8/controls/builder-preview-before.verdict` records real `bun run lint` exit 0 for a temporary `src/builder/.task-64-8-builder-preview-probe.ts` importing `@/preview/sample-records` before the builder rule changed. After adding both `@/preview` and `@/preview/**` to the builder override and updating its diagnostic, the same probe exited 1 with `eslint(no-restricted-imports)`; output is `controls/builder-preview-after.output`. A temporary probe importing `@/ui/stub-rolling` and `@/ui/themes` exited 0; output is `controls/builder-ui-allowed-after.output`. All repository probes were removed.
Batch 2 R2/R3: corrected both active DESIGN.md `themes.ts` references to `src/ui/themes.ts`; corrected AD-20 to name `src/copy.ts` separately. Historical memlogs and original-change spec references were preserved.
Review triage: deferred Blind Hunter 1 relative-path alias bypass because no current offending import or runtime defect was demonstrated and resolved-import enforcement is outside this task; deferred Blind Hunter 4 because the built smoke proves visible dice settlement but not callback invocation, with no callback regression demonstrated. Neither deferred item is claimed as a runtime bug; both are recorded in `deferred-work.md`.
Smoke limit retained in the spec: built-output smoke observed `DARK -> LIGHT`, a settled dice cell with no rolling/error message, and zero browser errors, but did not prove callback invocation. Final review completed healthy; task is ready for closure.

Active documentation search also corrected `backlog/docs/doc-2` to `src/ui/stub-rolling.ts` through `backlog doc update doc-2`, and the tracked `.working/builder-layouts.html` token-source comment to `src/ui/themes.ts`; historical task/spec/memlog references to the original move were preserved. Batch 2 final checks: `bunx oxfmt --ignore-path .gitignore --check .` exit 0 (`controls/format-batch2.verdict`, `controls/format-batch2.output`); `bun run lint` exit 0 with existing warnings only (`controls/lint-batch2.verdict`, `controls/lint-batch2.output`).

Final-after-doc-repair evidence: `bunx oxfmt --ignore-path .gitignore --check .` exit 0 in `controls/format-batch2-final.verdict` / `controls/format-batch2-final.output`; `bun run lint` exit 0 with existing warnings only in `controls/lint-batch2-final.verdict` / `controls/lint-batch2-final.output`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved shared preview helpers from src/preview to src/ui, rewired builder and preview importers, and added the lint boundaries. Existing evidence remains green: 3029 unit tests passed with 1 environment skip, 521 browser tests passed, and the full executable check passed. Final focused-to-final review was healthy with 2/2 reviewers and no blocking findings. Deferred limits are relative-path bypass coverage and callback invocation proof in the built smoke.
<!-- SECTION:FINAL_SUMMARY:END -->
