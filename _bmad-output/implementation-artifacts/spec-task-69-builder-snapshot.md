---
title: 'TASK-69: Show and keep a snapshot in the builder window'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: 'cd2d41d9cad6be2110158c02ad68924d7d2803f7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-muster-roll/builder-and-dev.md'
  - '_bmad-output/specs/spec-muster-roll/stories.yaml'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The builder shows empty templates, not the sheets and values a GM will use. A GM cannot open a snapshot beside a preset.

**Approach:** Keep a snapshot with the preset in the builder's draft. Draw its sheets through the extension window, with a sidebar, a working «+ Добавить» for each sheet set, and a pale «Образец» for an empty set. Open and download snapshots through the existing file format.

## Boundaries & Constraints

**Always:** Use one builder store and whole-step undo/redo for preset and snapshot changes. Keep structure selection and problem marks. Render through `WindowFrame`, `SheetHeader` and `SheetBody`. Reuse the snapshot parser, importer and encoder. Drop values that no longer fit a changed preset, without a warning. Keep Russian interface text in `src/copy.ts`.

**Never:** Load the replica engine, mock adapter or Owlbear runtime in the builder. Values remain read-only in this story. Double-click typing, dice rolls, the GM/player switch, file blocks, disk writes and removal of old dev pages belong to later stories.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Open snapshot | Current preset and a valid snapshot with two sheets of one set | Sidebar lists both sheets in order; selecting each shows its own values | Values without a place in the preset drop silently |
| Empty set | A sheet set with no snapshot sheets | Pale «Образец» exposes its structure for selection; «+ Добавить» creates a real sheet | The sample itself stays out of downloaded data |
| Single sheet | A single-sheet template, with or without stored values | One sidebar entry shows the sheet through the same window | Empty values remain empty |
| Download | Snapshot in the builder | Downloaded JSON is a valid snapshot, with kept sheets, values and live token links | No preset, rights or builder identities enter the file |
| Reload | Draft contains preset and snapshot | Next visit restores both without a prompt | Storage failure uses the existing draft failure status |
| Old draft | Existing preset-only draft | Preset reopens with an empty snapshot | No loss of an otherwise readable preset |
| Bad file | Malformed, unsupported or oversized snapshot | Refusal message; current preset and snapshot stay unchanged | Reuse existing snapshot refusal messages and size checks |
| Preset edit | A field, section or template loses its place | Snapshot follows the current preset; removed values disappear without a warning | Undo restores the prior preset and snapshot together |

</frozen-after-approval>

## Code Map

- `src/builder/builder-store.ts`: `BuilderStep`, `apply`, `open`, `readDraft` and `writeDraft` own history and persistence. Extend this boundary, not a second store.
- `src/builder/preview-pane.tsx`: currently draws one empty template. Preserve cell-to-tree mapping and scaled window sizing while selecting real sheets.
- `src/builder/preview-navigation.ts`: pure shown-tab reducer. Extend navigation here; React keeps effects and uses `useReducer`, per ADR 0002.
- `src/builder/preview-records.ts`: empty sample records and placeholder names. Keep samples separate from snapshot content.
- `src/ui/shell/sidebar-entries.ts`: sole owner of sidebar grouping and ordering; `sidebarEntries` reads core visibility and sheet policy.
- `src/core/snapshot-import.ts`, `src/core/snapshot-file.ts`: parse, reconcile, encode and format snapshots; preserve their existing room contracts.
- `src/builder/builder-page.tsx`: file opening, replacement confirmation, download controls and draft status.
- `src/copy.ts`, `src/ui/settings/snapshot-text.ts`: shared Russian labels and snapshot refusal messages.
- `GLOSSARY.md`: Builder, Draft and Preview currently describe preset-only content.

## Tasks & Acceptance

**Execution:**
- [x] `src/builder/builder-store.ts` — keep snapshot changes, reconciliation and persistence inside store steps.
- [x] `src/builder/preview-navigation.ts`, `src/builder/preview-pane.tsx`, `src/builder/preview-records.ts` — navigate snapshot sheets, retain structure selection, and draw samples only for empty sets.
- [x] `src/ui/shell/sidebar-entries.ts` and shared shell types — support real sheets, sample styling and add controls through the existing frame.
- [x] `src/builder/builder-page.tsx`, `src/copy.ts` — add snapshot open/download actions using existing file checks and error messages.
- [x] `src/builder/*.test.ts`, `tests/builder-snapshot.e2e.ts`, `tests/builder.e2e.ts` — cover the matrix and preserve existing builder behavior.
- [x] `GLOSSARY.md` — update Builder, Draft and Preview for snapshots.

**Acceptance Criteria:**
- Given a preset and a two-sheet snapshot, when either sidebar entry opens, then the extension window shows that sheet's values.
- Given an empty sheet set, when its sample is selected or «+ Добавить» is pressed, then its structure remains selectable and a real sheet can be created.
- Given a preset change, when values lose their place, then they drop silently and undo restores the complete prior step.
- Given a production build, when the builder's runtime module graph is inspected, then it contains neither the replica engine nor the mock adapter.
- Given the glossary, when Builder, Draft and Preview are read, then all three describe the snapshot-based builder.

## Implementation Notes

- `BuilderStep.records` stores the snapshot beside the preset. Draft parsing accepts old preset-only drafts, writes snapshot records, and reconciles records through the existing snapshot importer on preset edits so undo and redo restore the whole step.
- The preview uses real snapshot sheets, pale synthetic samples only for empty sets, and the existing `WindowFrame`, `SheetHeader` and `SheetBody`. Sheet selection and fallback transitions live in the pure `preview-navigation.ts` reducer and are dispatched with `useReducer`.
- Builder snapshot open/download uses the existing parser, importer, encoder, size limits and refusal messages. Room snapshot contracts and shared banner semantics remain unchanged.
- `GLOSSARY.md` describes snapshots for Builder, Draft and Preview. Locked browser coverage was re-locked at `3f27d7948c348ac8693594a640427006004736b4`.
- Final browser evidence: focused `7 passed (3.4s)` and full `528 passed (2.8m)`, both exit 0. The production build transformed 1678 modules and exited 0. The builder entry graph reached 7 chunks and 489 source-map modules, with no `src/replica` or `src/platform/mock` sources.
- Review fixes landed in `4dc32a0dc04dae163202ece2cdc28e6a8494c86c`: stable document uids now keep builder sidebar identity, selection and problem marks separate from editable preset ids; Add refuses an invalid set id without throwing or changing the draft.
- The final repair passed 532 browser tests and 3166 unit tests, with one existing environment skip. Formatting, lint, typecheck, the source-map production build and bundle inspection passed. The earlier counts above describe the initial implementation.
- Tests now cover snapshot replacement/add undo and redo, importer refusal, invalid-id Add and duplicate-id navigation. No new mutation-calibration or independent review round was run after the final scoped repair. Deferred topics are recorded in `deferred-work.md`.

## Spec Change Log

## Review Triage Log

| Round | Finding | Verdict | Evidence / route |
| --- | --- | --- | --- |
| 1 | B1: template marks use old uid keys | medium | Confirmed sidebar/markSelector mismatch; repair with stable builder UI identity. R1. |
| 1 | B2: empty real repeat sections lack samples | false | The actual snapshot has no blocks; only empty sheet sets require a sample. |
| 1 | B3: invalid set id throws on Add | medium | Allowed invalid form state reaches recordSchema.parse; refuse without throwing. R2. |
| 1 | B4: post-add automatic selection | low | Not specified for nonempty/different sets; defer product choice. |
| 1 | B5: oversized row reconciliation | low | Constructed transport-limit input, no named occurrence; defer policy. |
| 1 | B6: file read rejection UX | low | Separate unobserved I/O-error path; defer. |
| 1 | B7: stale asynchronous file read | low | Constructed reversed-completion case; defer arbitration policy. |
| 1 | B8: partial corrupt-draft recovery | low | No app-produced corrupt-record occurrence; missing-field compatibility already passes. Defer. |
| 1 | E1: invalid set id | medium | Same verified exception as B3; R2. |
| 1 | E2: random/template id collision | low | Forced collision without a ticket occurrence; defer. |
| 1 | E3: non-increasing unsafe order | low | Constructed large imported number; defer. |
| 1 | E4: oversized reconciliation record | low | Same transport-limit construction as B5; defer. |
| 1 | E5: rejected file read | low | Same I/O-error UX omission as B6; defer. |
| 1 | E6: stale file read | low | Same arbitration omission as B7; defer. |
| 1 | E7: duplicate template ids select first template | medium | Mutable domain IDs are used as UI identity; stable document uids must distinguish the templates. R1. |
| 1 | E8: removed uid mapping loses marks | medium | Same confirmed mismatch as B1; R1. |
| 1 | E9: no repeat cells after Add | false | Real sheets draw their actual zero-block snapshot; the structure remains in the tree. |
| 1 | V1: snapshot/add undo coverage | low | Current code uses apply correctly; add local tests against the whole-step history contract. R3. |
| 1 | V2: preset-open snapshot policy coverage | low | Clearing versus reconciling is not explicitly settled by the ticket; defer policy-specific assertion. |
| 1 | V3: importer refusal UI coverage | low | Parser test does not reach importer refusal; add a local browser test with unchanged-data assertion. R4. |

## Verification

- Permanent tests use the approved story and snapshot format as independent oracles. Assert literal sheet names, values and file content through the store and browser.
- Run the full source-change checks from `CLAUDE.md`, including the complete browser suite and production build.
- Inspect the actual builder runtime module graph for forbidden runtime dependencies; a source absence assertion is not a behavioral test.
- Read TASK-69 through the Backlog CLI, run `backlog doctor`, and check the touched diff. Markdown formatting is skipped by project configuration.
