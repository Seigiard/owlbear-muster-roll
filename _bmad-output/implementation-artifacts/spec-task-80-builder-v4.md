---
title: 'TASK-80: Builder covers preset format v4'
type: 'feature'
created: '2026-11-17'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '29ffe1719f3e881b12dbbe2dfc7ee200902ae937'
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-builder.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="owner-authorized autonomous TASK-80 execution">

## Intent

**Problem:** Builder forms still use pre-v4 shapes. A GM cannot configure row visibility or repeat scopes, and the form does not consistently allocate, expose, or preserve v4 ids.

**Approach:** Make the hand-written Builder forms and document operations match the canonical registry while retaining accepted TASK-79 nested scope behavior and existing preview, drag, file, and player-view owners.

## Boundaries & Constraints

**Always:** Use hand-written controls, one per applicable registry key. A template repeat has `nameField` only and keeps `template.id` as its identity. Tab, section, and row repeat controls create an id from the node title or place and offer only text field ids inside that repeat scope. Token ids share the same scoped allocation rules. A form for a preset opened from a file warns before an id change or repeat removal can erase room values or blocks. Field rename continues to use TASK-79 ancestor-aware resolution.

**Never:** Generate forms from a schema; add `template.repeat.id`; alter TASK-81/82/89–98 behavior; claim owner-only Owlbear evidence; duplicate focused tests that existing browser owners already cover.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Repeat controls | A tab, section, or row gains repeat | The document gets a unique suggested scope id and a `nameField` selectable from text fields in that scope | Missing text fields retain the valid fallback until the form becomes valid |
| Loaded document safety | A loaded preset changes a repeat id or disables repeat | The form warns that matching room blocks will be erased on preset upload | Draft and example documents show no loaded-file warning |
| Token identity | A token cell is added beside fields or tokens | Its suggested id is unique in the applicable scope and remains rewritable through the id input | Existing token ids count as taken |

</frozen-after-approval>

## Code Map

- `src/core/preset-registry.ts` -- canonical v4 keys; forms cover applicable keys but do not derive UI from this table.
- `src/builder/document.ts` -- document conversion, scoped id allocation, repeat defaults, movement and `renameField`; remove the unneeded `any` during v4 conversion.
- `src/builder/item-form.tsx` -- selected-node forms; thread `origin` to loaded-file warnings and replace legacy template kind control with repeat controls.
- `src/builder/document.test.ts` and `src/builder/document-v4.test.ts` -- public pure-document owners for v4 round trips, suggestions, and scope-preserving operations.
- `src/builder/item-form.test.tsx` -- rendered form owner for controls, scoped choices, and loaded-file warnings.
- `tests/builder.e2e.ts`, `tests/repeat-tabs.e2e.ts` -- existing owners for drag, preview GM/player, file round trip, and public repeat-tab behavior; do not duplicate them.

## Tasks & Acceptance

**Execution:**
- [ ] `src/builder/document.ts` -- generalize repeat creation and scoped taken-id collection for tab, section, row, and token operations.
- [ ] `src/builder/item-form.tsx` -- render the v4 node forms, selected name-field choices, and loaded-file destruction warnings.
- [ ] `src/builder/{document,document-v4,item-form}.test.tsx` -- lock independent Builder behavior at pure document and rendered public form seams.
- [ ] `_bmad-output/implementation-artifacts/spec-task-80-builder-v4.md` -- record lock, checks, calibration, and implementation result.

**Acceptance Criteria:**
- Given a v4 Builder node, when its form is selected, then it has the applicable hand-written registry controls, including row visibility and repeat.
- Given a repeat scope or token is added, when Builder creates its id, then the id is valid and unique in the scope; changing a loaded preset's scope identity warns before a possible room-data erase.
- Given existing public Builder owners run unchanged, when v4 forms are added, then drag containment, file parse/download gating, GM-only preview controls, and player visibility retain their covered behavior.

## Implementation Notes

- Footprint at planning: 2 source files and 3 focused test files; estimated 3–5 hours including browser validation. Existing browser owners supply TASK-80 AC4–6, so the implementation lock targets the uncovered forms and document operations.
- The owner authorized autonomous execution in the TASK-80 orchestrator prompt. No product decision remains open: preparation resolves the apparent template-id contradiction in favor of `template.id`.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun test src/builder/document.test.ts src/builder/document-v4.test.ts src/builder/item-form.test.tsx` -- expected: focused Builder document and form behavior passes. (1 minute)
- `bunx oxfmt --ignore-path .gitignore --check .` -- expected: repository format check passes. (1 minute)
- `bun run lint` -- expected: type-aware lint passes. (2 minutes)
- `bun run typecheck` -- expected: TypeScript check passes. (1 minute)
- `bun test` -- expected: all Bun tests pass. (3 minutes)
- `bun run build` -- expected: production bundle builds. (1 minute)
- `bun run test:browser -- --workers=2` -- expected: browser suite passes in the parent-owned serialized slot; run after a clean SHA. (CI / parent slot)
