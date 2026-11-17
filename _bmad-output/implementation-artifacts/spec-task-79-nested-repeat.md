---
title: 'TASK-79: Nested repeat blocks inside blocks'
type: 'feature'
created: '2026-11-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b0f8db3fd0261ec4274af655fc1f4922fb1cd0f8'
context:
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/storage-and-sync.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A repeat tab must give each parent block its own nested repeat blocks. The preserved TASK-79 candidate supports much of that behavior but accepts a child under the wrong parent path and rejects the same child scope id beneath distinct parents.

**Approach:** Carry complete `(scope id, block id)` paths through parsing, storage, editing, rendering, duplication, migration and snapshot import. Validate each path against its exact preset ancestry and preserve parent-local repeat-scope identity.

## Boundaries & Constraints

**Always:** Keep one versioned record per block. Resolve a formula from its block through enclosing blocks and then the sheet. Count every dropped value in an invalid nested block path, retain its valid ancestors, preserve prior TASK-78/81/82/89–98 behavior, and make a repeat `nameField` follow a rename only in its nearest scope.

**Never:** Add old-format conversion, a nesting-depth limit, new Builder forms, deployment, or an Owlbear-host acceptance claim. TASK-80 owns Builder controls; TASK-86 owns live concurrent-edit evidence and TASK-79 AC5 stays unchecked.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Independent nested blocks | Two NPC blocks each have `attack` blocks | Editing or rolling one path leaves the sibling path unchanged | A missing parent rejects child edits |
| Parent-local scopes | `npc → attack` and `boss → attack` | Parser accepts both independent `attack` scopes | Duplicate only within the same parent scope is refused |
| Formula and rename | Attack `3`, NPC `7`, sheet `2`; rename attack name field | Roll is `12`; only attack formulas and its `nameField` change | Unknown/nonnumeric fields retain roll errors |
| Duplicate and links | Duplicate an NPC with an attack and token link | Nested values and order copy, source and duplicate diverge after edit, duplicate has no links | Deleted parent makes descendants unavailable |
| Import and upload | Snapshot has `loot:l1` and invalid `loot:l1:attack:a1` | Retain `loot:l1`, omit child, and report loss count `1` | Upload reports nested losses once before writes |

</frozen-after-approval>

## Code Map

- `src/core/records.ts`, `sheet-values.ts`, `field-patch.ts` -- record keys and immediate-parent child traversal; preserve root and one-pair compatibility.
- `src/core/preset.ts`, `formula-evaluate.ts`, `formula-rename.ts`, `dice-roll.ts` -- lexical scope lookup, parser validation and repeat `nameField` ownership; scope identity must include its parent path.
- `src/core/preset-migrate.ts`, `snapshot-file.ts`, `snapshot-import.ts` -- full-path migration and import validation/loss accounting; the current importer reads only the first pair and accepts any nested descendant.
- `src/replica/composers.ts`, `repeat-block-duplicate.ts`, `link-target.ts`, `rendered-tabs.ts` -- public commands, duplication, links and tab identity over complete paths.
- `src/ui/sheet/*`, `src/builder/preview-{pane,records}.tsx` -- selected path flows through rendering and preview without changing TASK-80-owned Builder forms.
- `src/core/{preset,sheet-values,dice-roll,formula-rename,snapshot-import,link-target}.test.ts`, `src/replica/{engine-blocks,engine-link,engine-preset}.test.ts`, `tests/nested-repeat.e2e.ts` -- focused owners for all automated criteria. The two parent observations add parser and public import owners.
- `docs/preset-format.md`, `_bmad-output/specs/spec-muster-roll/{preset-format,storage-and-sync}.md`, `GLOSSARY.md` -- publish arbitrary nested paths and parent-local scope identity after runtime evidence is green.

## Tasks & Acceptance

**Execution:**
- [ ] Focused test owners -- port the preserved lock and add public parser/import owners for the two observed full-path defects.
- [ ] Core scope and record modules -- replace leaf-only scope lookup with parent-path-aware validation and lexical resolution.
- [ ] Replica, UI and preview consumers -- pass complete paths through commands, subtree copies, links, tabs and selected rendering.
- [ ] Migration and file consumers -- retain only valid full paths, tombstone invalid descendants and count literal dropped values.
- [ ] Contracts -- remove the temporary nested-repeat boundary only after runtime behavior passes.

**Acceptance Criteria:**
- Given nested sibling paths, when one block is changed, rolled, linked or duplicated, then only that exact subtree changes and a duplicate has no copied links.
- Given a child under an invalid parent path, when a snapshot is imported or a preset is uploaded, then valid ancestors remain and every child value is counted as lost.
- Given two parent scopes with the same child repeat id, when their preset is parsed, then both are accepted while same-parent duplicates remain refused.
- Given automated checks are complete, when TASK-79 is reported, then AC5 is explicitly left for TASK-86 owner evidence.

## Implementation Notes

- Base: `d938597c812c1c2877c51fb3c33379e2d6e84628`; preserved candidate base: `1afdbedd3d065679be24b257c5877a7fcd26eee0`, candidate: `d4fd3881f9a50dbc4fa23f4ec87a67464c16c14e`.
- Candidate footprint: 23 source files and 9 test files. This is one user-facing goal despite the cross-layer footprint; owner approved autonomous TASK-79 completion. Estimated implementation and focused validation: 1–2 hours; this run is bounded to 60 minutes.
- Irreversible effects: none. Runtime paths may remove invalid nested snapshot values only during the existing explicit import/upload confirmation flow.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun test src/core/preset.test.ts src/core/sheet-values.test.ts src/core/dice-roll.test.ts src/core/formula-rename.test.ts src/core/snapshot-import.test.ts src/core/link-target.test.ts src/replica/engine-blocks.test.ts src/replica/engine-link.test.ts src/replica/engine-preset.test.ts --test-name-pattern 'nested|parent|scope|copies|loss|rename|attack'` -- expected: focused public owners pass.
- `bun run test:browser -- --workers=1 tests/nested-repeat.e2e.ts` -- expected: nested edit consumer passes when parent grants the browser slot.
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run build` -- expected: exit 0.
- `backlog task view TASK-79 --plain`, `backlog doctor`, `git diff --check` -- expected: task remains In Progress with AC5 unchecked; metadata and diff are valid.
