---
title: 'TASK-77: Preset format v4'
type: 'feature'
created: '2026-11-16'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '650e9e5517c08f840a223c79a79944e74602b6cf'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Format v3 makes naming, repetition and token links depend on special cases.

**Approach:** Implement story 9: one node registry for the v4 tree, explicit repeat identities and names, row objects, token cells and inherited visibility.

## Boundaries & Constraints

**Always:** Follow the companion contract. Templates use `repeat: {nameField}`; sections/rows use `{id,nameField}`. Cells retain `kind`; template `kind`, `tokens` and array rows disappear. Allow `players: "edit"` on any template. Preserve per-cell merge, lifecycle, clear markers, transport bounds and Builder's shared renderer.

**Never:** No converter, deployment, repeat tabs or nested block scopes. Temporarily reject the latter two by rules, not schema. Sheet sets may contain repeat sections/rows. Full Builder controls remain TASK-80; adapt existing operations without losing v4 properties.

## I/O & Edge-Case Matrix

| Input / state | Required result |
|---|---|
| Valid v4 / v1–3 preset or snapshot | Accept v4; refuse older files without writes |
| Duplicate id in a scope; invalid nameField; tab repeat; nested block repeat | Reject at the Builder item with the upload's reason |
| First field moves; nameField changes; plain rows move | Stable repeat.id keeps blocks; names follow nameField; plain values stay |
| Repeat section or row | Independent blocks per sheet; row blocks contain one row; duplicate numbers use nameField |
| Several token cells, including root and block cells | GM icon/status/menu per cell; player renders nothing; links target sheet, block path and cell |
| Token opens / map selection changes | Open correct tab and scroll to cell; selection marks do not navigate |
| Token label | Nearest available block name, section title, sheet name or template title |
| Hidden section or row | No player display, edit or token opening; rolls reach GMs only |
| Upload changes repeat.id, toggles repeat, removes fields or token cells | Apply contract loss rules with one confirmation; count values and sheets, not links; cancel changes nothing |

**Decision:** Linking lists all scene tokens, marks existing links and permits reassignment to this cell. Prefer: on-screen unlinked, off-screen unlinked, on-screen linked, off-screen linked. Screen means the client's map viewport; ranking is best-effort. Keep token-menu linking.

**Decision:** Unlinking lets the GM choose one or several of this cell's linked tokens. Preserve other links and map tokens.

</frozen-after-approval>

## Code Map

- `src/core/preset.ts`, `format-version.ts`: structure, traversal, resolution and shared upload/Builder checks.
- `src/core/sheets.ts`, `sheet-values.ts`, `formula-rename.ts`, `formula-evaluate.ts`, `repeat-block-duplicate.ts`: identity, scopes and names.
- `src/core/visibility.ts`, `access.ts`, `field-patch.ts`, `token-links.ts`, `link-target.ts`, `token-selection.ts`: policy, per-field admission and targets.
- `src/core/records.ts`, `snapshot-file.ts`, `snapshot-import.ts`, `preset-migrate.ts`: link payloads, file boundaries and upload losses; reuse block keys.
- `src/replica/composers.ts`, `pending-edits.ts`, `roll-flow.ts`, `engine.ts`, `src/core/ui-messages.ts`: commands, replay, roll visibility and cell opening.
- `src/ui/sheet/`, `src/ui/main.tsx`, `src/ui/navigation.ts`, `src/ui/shell/sidebar-entries.ts`, `src/ui/picker/`: rendering, navigation and token actions.
- `src/builder/`, `src/preview/sample-records.ts`: document conversion, existing forms/tree, problems, preview records and reconciliation.
- `src/platform/ports.ts`, `src/platform/{obr,mock}/index.ts`: token lists/viewport. SDK 3.1.0 provides viewport transforms and item bounds.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/preset.ts`, new `src/core/preset-registry.ts` — strict per-kind keys/children; separate id, nameField, formula, width and temporary rules with paths.
- [ ] Mapped core naming/policy modules — remove first-field and template-kind assumptions; support repeat rows, player-editable sets and inherited visibility.
- [ ] Mapped record/file/migration modules — v4 files, `{s,path?,c}` links, stable scopes and loss counts.
- [ ] Mapped replica and UI modules plus `src/copy.ts` — wire scoped commands, GM token-cell menus, ancestor labels, cell opening, selection and GM-only rolls.
- [ ] Mapped platform adapters and `src/ui/picker/` — reverse picker; fall back to unlinked-first sorting if viewport reads fail.
- [ ] `src/builder/`, `src/preview/sample-records.ts` — lossless conversion, valid defaults, operations, renames, problems and records.
- [ ] `src/{core,replica,builder}/*.test.ts`, `tests/*.e2e.ts`, `tests/support/` — port fixtures and protect matrix outcomes.
- [ ] `docs/preset-format.md`, `docs/example-preset.json`, `presets/*.json`, `tests/fixtures/presets/*.json`, `GLOSSARY.md` — publish v4; add Repeat scope, Block, Token cell; retire Linkable; widen Repeat section.
- [ ] `_bmad-output/specs/spec-muster-roll/storage-and-sync.md` and `_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md` — replace transitional v3 preset/link/visibility rules; preserve unrelated decisions.

**Acceptance Criteria:**
- Given supported v4 files, when room and Builder exchange preset and snapshot, then structure, values and applicable token links survive.
- Given the updated examples, when the preset parse tests run, then every example passes the same validator as uploads.
- Given two clients editing different cells of one block, when v4 commands sync and reload, then both values remain.

## Design Notes

Field/token ids belong to their block scope; repeat ids belong to the parent. Template repetition adds no block-path pair. Remove field-matching repeat relocation: changed scope ids erase blocks. Preserve invalid editing states and undo; forms stay hand-written. Distinguish equal picker targets by location/cell id without changing offered token labels.

## Verification

Declare independent oracles before test edits; calibrate red then green. No broad mutation sweep. Run `CLAUDE.md`'s full checks, the example parse test, Backlog read/doctor and diff checks. Preserve the size workload/margin. Mock tests do not prove Owlbear behavior.

## Implementation Notes

- Approved for implementation in this session on 2026-11-16. Implementation budget: 45 minutes. At 90 minutes, stop at the next checkpoint and report completed and remaining work to the parent for a continue/split/keep-partial decision. This budget includes delegated implementation work.

## Spec Change Log

## Review Triage Log