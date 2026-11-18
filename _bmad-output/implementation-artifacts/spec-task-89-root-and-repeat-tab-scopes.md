---
title: 'TASK-89: Keep repeat-tab fields out of root migration and edit scopes'
type: 'bugfix'
created: '2026-11-17'
status: 'ready-for-dev'
route: 'dispatch'
baseline_commit: 'a87fc3cc2dccb02d1ec29c4ec4aaf49d82b89f83'
review_loop_iteration: 0
context:
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-77-98-completion.md'
---

<frozen-after-approval reason="Backlog TASK-89 acceptance criteria">

## Intent

**Problem:** A field in a repeat tab can reuse a root field id. `templateScopes` records the repeat-tab fields as a block scope, then records them again as root fields. The later field wins by id, so preset migration, root edits and proposals, and snapshot import apply the wrong field definition. An unchanged preset upload can clear a root value without reporting a loss.

**Approach:** Make the root collection in `templateScopes` exclude repeat tabs. Keep repeat-tab fields in their tab-block scope. Let existing consumers of `templateScopes` resolve root and tab-block values from those separate scopes.

## Boundaries & Constraints

**Always:** Preserve a root `hp` number value and a repeat-tab `hp` text value as independent values. Preserve a root value on an unchanged preset upload. Detect and count a removed root field even when a same-id field remains in a repeat tab. Exercise preset reconciliation, GM edits, player proposals and snapshot import through their existing public consumers.

**Never:** Do not change accepted nested support, record-key parsing, repeat-tab storage layout, or player/GM authorization policy. Do not alter unrelated upload, edit, proposal or import behavior.

## Code Map

- `src/core/preset-migrate.ts` — `templateScopes` must collect root rows only from non-repeat tabs. `presetDiff`, `stripToTemplate`, `presetMoves` and consumers already consume this shared boundary.
- `src/replica/composers.ts` — GM field patches call `stripToTemplate`; protect the root result without a local workaround.
- `src/replica/proposal-queue.ts` — player proposal stripping reads root `templateScopes`; protect that consumer without a second scope calculation.
- `src/core/snapshot-import.ts` — root snapshot cells use `templateScopes`; protect independent root and tab-block values.
- Test owners: `src/core/preset-migrate.test.ts`, `src/replica/engine-preset.test.ts`, `src/replica/composers.test.ts`, `src/replica/proposal-queue.test.ts`, and `src/core/snapshot-import.test.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] Lock public-consumer regressions for unchanged upload, root edits, player proposals, snapshot import and root-field removal with same-id repeat-tab fields.
- [ ] Exclude repeat-tab rows from the shared root scope collection while retaining the repeat-tab block scope.
- [ ] Run focused consumer owners, then the source checks required for changed source and test paths.

**Acceptance Criteria:**
- Given root `hp=7` and a later repeat-tab text field `hp`, when the unchanged preset uploads, then the root value remains, no root null-clear is written, and no loss is reported.
- Given same-id root and repeat-tab fields, when GM edits, player proposals, preset reconciliation and snapshot import run, then each root consumer resolves the root field independently.
- Given a root field is removed while a same-id repeat-tab field remains, when the preset changes, then the root field is erased and counted.
- Given independent root and tab-block values, when public consumer regressions reproduce the prior loss and then run after repair, then root and tab-block values remain independent.

## Verification

**Commands:**
- Focused Bun owners selected by the test lock for migration, engine upload, composer, proposal queue and snapshot import.
- Required source checks: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser --workers=2`, and `bun run build`.

## Implementation Notes

- The shared `templateScopes` boundary is the only production repair point. The individual consumers above are regression evidence, not alternative scope implementations.
- The known full-browser baseline may fail only at `tests/open.e2e.ts:253` NPC token focus; retain that distinction if it recurs.

</frozen-after-approval>
