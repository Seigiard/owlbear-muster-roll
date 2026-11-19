---
title: 'TASK-121.1: Move the command composer from replica to core'
type: 'refactor'
created: '2026-11-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0460c9d03c8b9ab94af05f7b1bac2937bedae681'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/docs/adr/0005-command-composition-lives-in-core-and-the-builder-preview-shares-it.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/replica/composers.ts` turns a window command into records, imports only `src/core`, and takes everything else through its `ComposeContext`; yet it sits in the replica layer, so the Builder (AD-20: no replica import at runtime) cannot call it and keeps its own copy of the same rules.

**Approach:** Move the module and its test to `src/core/compose.ts` and `src/core/compose.test.ts` unchanged, and `src/replica/version-minter.ts` with its test to `src/core/version-minter.ts` (it imports only `@/core/merge` and TASK-121.2 needs it from core); switch the replica importers, and leave no shim behind. This is PR 1 of 2 (TASK-121, ADR-0005); behaviour does not change.

## Boundaries & Constraints

**Always:** Keep every export, its name and its signature as it is in `src/replica/composers.ts` at the baseline (`createComposers`, `Composers`, `ComposeContext`, `ComposeMode`, `FieldPatchCommand`, `IdentifiedPatch`, `PatchRefusal`, `ComposedPatches`, `PresetUploadLoss`, `PresetUploadBatch`, `PresetUploadRefusal`, `blockLinkTombstones`). Move with `git mv`, so `git log --follow` keeps the history. The whole `bun test` junit list of test names equals the one taken at the branch HEAD before any edit (procedure under Verification). Follow `.oxlintrc.json`: `src/core/**` may import only `@/core/**` and libraries; the `src/builder/**` override keeps forbidding `@/replica/**` and `@/platform/**`.

**Never:** No re-export from `src/replica/composers.ts` or `src/replica/version-minter.ts`; both files are gone. No change to what the module does, no renamed internals, no new tests beyond the moved file. Do not touch `src/builder/`, `src/preview/`, the spine or ADRs (TASK-121.2 owns them). Do not merge this with any TASK-115 step.

</frozen-after-approval>

## Code Map

- `src/replica/composers.ts` (1139 lines) -- the module to move; imports only `@/core/*`; `createComposers(connectionId)` keeps a decoded-preset cache and uses `connectionId` in `recordFitsOneMessage` (line 161) and in `composePatches` (line 384).
- `src/replica/composers.test.ts` (189 lines) -- moves beside it; line 6 `import { createComposers } from './composers'` becomes `'./compose'`.
- Importers to switch to `@/core/compose`: `src/replica/engine.ts:49`, `src/replica/command-routing.ts:11`, `src/replica/command-routing.test.ts:4`, `src/replica/pending-edits.test.ts:10`, `src/replica/pending-queue.ts:3`, `src/replica/room-protocol.ts:28-29`. Verify with `grep -rn "replica/composers" src tests`.
- `src/replica/version-minter.ts` (20 lines), `version-minter.test.ts` -- move to `src/core/`; importers: `src/replica/engine.ts:66` and the test's own `version-minter.test.ts:2` (`@/replica/version-minter` → `./version-minter`).
- `.claude/skills/edit-delivery/SKILL.md:119` -- names `src/replica/version-minter.ts`; update the path. The TLA+ files under `formal/` use the basename only.
- `.oxlintrc.json:110-170` -- the `src/core/**` override already forbids `@/replica/**`, `@/ui/**`, `@/builder/**`; nothing to add. Lines 351-358 (`src/builder/**`) stay as they are in this PR.
- `vite.config.ts:37-43` -- the `core` chunk matches `src/core/`; the moved module joins it. Every page loads the core chunk, so the window, picker and builder pages gain the composer bytes the background page alone carried; no size check exists. Record the `core-*.js` gzip size before and after in Implementation Notes. `tests/build.test.ts:191-200` checks the builder chunk imports no `obr-*` chunk; unaffected.
- `src/replica/engine.ts:934-964` -- `liveContext`/`dryContext`, the two `ComposeContext` builders; unchanged, they are TASK-121.2's model for the preview.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/compose.ts`, `src/core/compose.test.ts` -- `git mv` from `src/replica/composers.ts` and `composers.test.ts`; fix the test's relative import -- the one module behind ADR-0005.
- [ ] `src/core/version-minter.ts`, `src/core/version-minter.test.ts` -- `git mv` from `src/replica/`; fix the test's import -- the minter is core data minting, and the preview will need it.
- [ ] `.claude/skills/edit-delivery/SKILL.md:119` -- the new path -- a skill that names a file an agent must open.
- [ ] `src/replica/engine.ts`, `command-routing.ts`, `command-routing.test.ts`, `pending-edits.test.ts`, `pending-queue.ts`, `room-protocol.ts` -- import from `@/core/compose` and `@/core/version-minter` -- no shim.
- [ ] Run the full check and compare the `bun test` junit list with the baseline -- proves the move changed no behaviour.

**Acceptance Criteria:**
- Given the baseline, when `grep -rn "replica/composers\|replica/version-minter" src tests` runs after the change, then it prints nothing and neither `src/replica/composers.ts` nor `src/replica/version-minter.ts` exists.
- Given `src/core/compose.ts`, when `bun run lint` runs, then the `src/core/**` no-restricted-imports override reports nothing, so the module imports only core.
- Given the moved tests, when `bun test src/core/compose.test.ts src/core/version-minter.test.ts` runs, then they pass with no edit beyond their import lines.
- Given the junit files from the procedure below, when the sorted `testcase name` attributes are compared, then they are equal, and the per-file counts are equal with the two moved paths mapped.

## Implementation Notes

- The move is `c7ab3ac`: both files and their tests are 100% renames except the two test import lines; six replica importers and `.claude/skills/edit-delivery/SKILL.md` switched to the core paths. No shim remains.
- `core-*.js` from `bun run build`: before (at `247bc0f`) 190 342 B raw, 57 053 B `gzip -9`; after (at `c7ab3ac`) 200 173 B raw, 59 900 B `gzip -9` (+2 847 B gzip on every page).
- Junit list: 3 502 `testcase name` attributes before and after, equal when sorted; per-file counts equal with `src/replica/composers.test.ts` → `src/core/compose.test.ts` (2) and `src/replica/version-minter.test.ts` → `src/core/version-minter.test.ts` (5) mapped.
- Old paths still appear in historical specs under `_bmad-output/` and in backlog tasks (TASK-99, TASK-115.3, …); they describe past state and are left as they are.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .` -- expected: clean (1 min)
- `bun run lint` -- expected: no errors (1 min)
- `bun run typecheck` -- expected: no errors (1 min)
- `bun test` -- expected: green (3 min)
- Junit baseline: before any edit, at the branch HEAD, `bun test --reporter=junit --reporter-outfile=<scratchpad>/before.xml`; after the change the same into `after.xml`; compare the sorted `testcase name` attributes, ignoring file and classname -- expected: identical (3 min)
- `bun run test:browser` -- expected: green; runs outside the sandbox (10 min)
- `bun run build` -- expected: builds; `tests/build.test.ts` passes inside `bun test` (2 min)
