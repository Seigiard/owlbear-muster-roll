---
title: 'TASK-41 Let a Preset Define Any Number of Sheet Sets and Single Sheets'
type: 'feature'
created: '2026-11-11'
status: 'draft'
baseline_commit: ''
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
  - '{project-root}/docs/preset-format.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A preset holds exactly two templates, `character` and `npc`, NPCs are a fixed special case, and the GM types each tab name by hand. A second system with a shared inventory or a spell list cannot be described. Backlog task: TASK-41; its six acceptance criteria apply in full.

**Approach:** Format v2: a preset is `sheets: Entry[]`, each a sheet set (`kind: "set"`) or a single sheet (`kind: "single"`) with its own sections, exactly as `docs/preset-format.md` now documents it. Every rule that branched on `pc`/`npc` reads the sheet's entry instead (AD-18). NPC becomes an ordinary single sheet; token links and duplicates move to repeat blocks (AD-19, CAP-30). v1 data is refused, and "Очистить всё" clears a room (CAP-31). The owner chose the whole scope as one task.

## Boundaries & Constraints

**Always:**
- Owner decisions (SPEC.md, memlog of 2026-11-11): sheet set and single sheet names; `visibility: "gm"` hides a template (interface, rolls, player token menu); `players: "edit"` only on a single sheet; a sheet set keeps the access panel and owner; `nameField` required on a sheet set, a non-repeat `text` field, editable by anyone with write access, header name edits it, empty shows "Без имени"; `tokens` on a sheet set, a single sheet or a `repeat` section; all rows of a repeat section form one block; upload rule «в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем»; "Дублировать…" on any repeat block (GM only); one scrolling tab list in preset order, gear pinned, a "+" per sheet set after its last sheet, a player's own sheets first; an upload that removes a template deletes its sheets and its one confirmation names values and sheets; snapshot import drops sheets of unknown templates and counts them; no migration from v1; GM-only "Очистить всё" in Settings.
- Records and rules exactly as ARCHITECTURE-SPINE AD-2, AD-4, AD-9 (wipe), AD-11 (`mr2`), AD-12 (`v: 2`), AD-13 (`hidden`), AD-14, AD-18, AD-19 and the Visibility and Sheet names conventions.
- Copy exactly as EXPERIENCE.md Voice and Tone; new copy lives in `src/ui/copy.ts`.
- New refusal reasons exactly as the "Refused files" table of `docs/preset-format.md`.

**Never:**
- Migration of v1 presets, snapshot files, room copies or `mr1` keys (except deletion by "Очистить всё").
- Per-player grants on a single sheet, `players` on a sheet set, duplicating a whole sheet of a sheet set.
- Touching the preset builder (TASK-38) beyond what the preview page needs to draw v2 presets.
- A kind enum (`pc`/`npc`) anywhere in records, messages, files or views.
- Names that break `GLOSSARY.md`: identifiers and copy use template, sheet set, single sheet, sheet, name field, visibility, player-editable, linkable, repeat block, duplicate and wipe. The JSON keys are `templates`, `kind: "set" | "single"`, `nameField`, `visibility`, `players`, `tokens`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| v1 preset upload | `{ v: 1, character, npc }` | Refused, nothing changes | "неподдерживаемая версия формата" |
| Bad nameField | sheet set names a number field or a repeat field | Refused | nameField reason |
| Repeat without field | `repeat` section whose rows hold no field | Refused | repeat reason |
| Two-row repeat section | Section with 2 rows, 5 fields | One repeat block holds all 5 values in one `rep:` record | N/A |
| Hidden single sheet roll | Player-visible? no; GM rolls on NPC | Only GM clients show it; dice extension `gm_only` | N/A |
| Player edits single sheet | `players: "edit"` | Committed by a GM client | Without it: `denied` |
| Upload drops a sheet set | 3 sheets of it exist | Confirmation names deleted sheets 3 and erased values | Cancel changes nothing |
| Upload drops section `tokens` | Blocks have links | Links tombstoned, not counted | N/A |
| Block removed | Block has 2 token links | Both links tombstoned by the GM client | Player removal: GM committer tombstones |
| Duplicate a repeat block ×9 | First field "Скелет 1" | Repeat blocks "Скелет 2".."Скелет 10" at section end, no links | Count outside 1-50: "Нужно число от 1 до 50" |
| Snapshot import | File sheet of an unknown template | Dropped, counted in "Не войдут листы" | N/A |
| v1 room copy | Room metadata copy `v: 1` | GM banner names "Очистить всё"; player "не читается"; no automatic overwrite | N/A |
| Wipe | Confirmed | New generation with no records; room copy written over; this room's local keys of every format deleted; others adopt | Cancel changes nothing |
| Empty name | New sheet of a sheet set | Tab, header, picker, roll, delete prompt show "Без имени" | N/A |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts` -- schema, `parsePresetFile`, `PresetFailure`, `formatPresetFile`, `resolveFieldReference`, `firstFieldId`. Rewrite to v2: `Preset { v, window?, templates: Template[] }` with `Template = SheetSetTemplate | SingleSheetTemplate` (`kind: 'set' | 'single'`), `templateById`, repeat block scopes (whole section), new failures `invalid-template-id`, `duplicate-template`, `bad-name-field`; `bad-repeat` now means no field in any row. The old `PresetTemplate` (sections only) merges into `Template`.
- `src/core/format-version.ts` -- `FORMAT_VERSION = 2`. `src/core/storage-key.ts` -- `mr2`; add a way to list/delete one room's keys of any `mrN` format. `src/replica/record-store.ts:131-146` `readHighestGeneration` counts a generation only with a record: add a generation marker key so an empty generation (after a wipe) survives a reload (AD-9).
- `src/core/snapshot.ts` `readSnapshot` -- return `older-version` apart from `invalid-snapshot` (AD-12).
- `src/core/records.ts` -- `sheetDataSchema { set, order }`; `linkDataSchema` `{ s } | { s, i }` (no section id; `instanceId` unique within a sheet, AD-2/AD-19). Emptied records keep non-null `d` (AD-2).
- `src/core/sheets.ts` -- `liveSheets` by template; add the template lookup (AD-18) and `sheetName(records, preset, sheetId)` (Sheet names convention); drop `parseSheetName` use for stored names (keep its length rule for the name field value if useful).
- `src/core/visibility.ts` -- take the decoded preset; `VisibleSheets` becomes tabs in preset order.
- `src/core/access.ts:131` `proposalAllowed` -- template-based rule (AD-4); keep judging only values that differ from the current record; another field absent from the template answers `stale`, not `denied`.
- `src/core/preset-migrate.ts` -- `presetDiff` per template; `removed` keyed by template id; add deleted-sheet count and link tombstones; `templateScopes` for multi-row repeat blocks.
- `src/core/snapshot-file.ts`, `src/core/snapshot-import.ts` -- v2 file (`set` per sheet, repeat block links), dropped-sheet count.
- `src/core/room-messages.ts:161`, `src/core/ui-messages.ts:115,125,319,327` -- roll `hidden`; `sheet-create { set }`; remove `sheet-rename` and NPC duplicate; add `repeat-block-duplicate`, link target, `wipe`; preset diff/upload results carry sheet count; snapshot check carries sheet count.
- `src/core/npc-duplicate.ts` -- rename to `repeat-block-duplicate.ts`; numbering over the first field of repeat blocks in one section of one sheet.
- `src/core/token-links.ts` -- link targets (sheet or repeat block), inert links (AD-19), menu filters by visible targets, picker groups in preset order.
- `src/core/dice-plus.ts:154` -- target from `hidden`.
- `src/core/field-patch.ts`, `src/core/sheet-values.ts` -- rep targets cover every row of the repeat block.
- `src/replica/composers.ts` -- `composeSheetCreate` (set, refuse template ids), delete, `composeSheetDuplicate` → `composeRepeatBlockDuplicate`, `composeLinkSet` target, acl/owner only on sheets of a sheet set, `nextOrder` per set, rep removal also tombstones links, preset upload batch.
- `src/replica/engine.ts` -- roll (`:1879-1893`, `:2095-2104` forged check; `hidden` computed once at request and also feeds the dice-extension target in `src/replica/dice-extension.ts`), strip to the sheet's template (`:1645`, `:3055`, `:3107`), wipe reuses the second half of the import path (generation mint `max(own, highestSeen)+1` outside catch-up, `saveGeneration`, `writeImportCopy`, `reset`, `removeGenerationsBelow`; not `planImport`), `importCopyVerified` `:1448` must refuse a newer-`v` copy like `runRoomCopyWrite` `:2528` does, older-format room copy notice (`unreadableRoomCopy` `:2769`), committing a player's block removal tombstones its links, adopting GM deletes older-format keys of the room.
- `src/ui/main.tsx` -- drop `NPC_TAB`; build tabs from visible templates in preset order with "+" per sheet set; player own sheets first; reveal for repeat blocks.
- `src/ui/shell/tab-bar.tsx`, `window-shell.tsx` -- several "+" buttons inside the scrolling list; only gear pinned.
- `src/ui/sheet/sheet-header.tsx` -- sheet set header (name edits name field), single sheet header; `npc-tab.tsx` removed; `duplicate-count.tsx` and `use-repeat-rows.ts`/`preset-section.tsx` -- repeat block controls, duplicate, repeat block token status.
- `src/ui/sheet/access-panel.tsx` -- radio label "Его лист"; sheet set only.
- `src/ui/picker/link-picker.tsx` -- groups and repeat block targets, label from the repeat block's first field.
- `src/ui/settings/*` -- "Очистка" section with "Очистить всё" and confirmation; preset/snapshot confirmations with sheet counts.
- `src/ui/copy.ts`, `src/ui/banner-message.ts` -- new copy and the older-format banner.
- `src/preview/sample-records.ts`, `preview-page.tsx` -- one frame per template.
- `src/platform/mock/*` -- token/context-menu mock stays; check any `kind` use.
- `src/core/snapshot-size.test.ts` -- new worst case: `tests/fixtures/presets/d20.json` v2, 6 sheets of a sheet set, a linkable NPC single sheet with 60 repeat blocks and 3 other single sheets; assert margin ≥ 1500.
- `tests/fixtures/presets/d20.json`, `d6-pool.json` -- rewrite to v2 (keep their systems; add a single sheet each, e.g. Инвентарь and Список заклинаний in one of them).
- `tests/*.e2e.ts`, `tests/support/room.ts` -- adapt to tabs, single sheet tabs, repeat block duplicate and links, wipe. Remove `tests/npc.e2e.ts`/`duplicate.e2e.ts` behaviour that no longer exists and cover the new one.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/**` -- v2 preset, records, template lookup, names, visibility, access, migrate, snapshot file/import, messages, token links, duplicate numbering, storage key, unit tests -- the contract every other layer reads.
- [ ] `src/replica/**` -- composers and engine on the template model, wipe, link cleanup on repeat block removal, older-format notice, tests -- AD-4, AD-9, AD-13, AD-14, AD-19.
- [ ] `src/ui/**`, `src/preview/**` -- tab bar, headers, repeat block controls, picker, settings, copy, preview, tests -- EXPERIENCE.md.
- [ ] `tests/fixtures/presets/*.json`, `tests/**/*.e2e.ts`, `tests/support/*` -- v2 fixtures and e2e coverage of AC 1-5.
- [ ] `src/core/snapshot-size.test.ts` -- re-measure the worst case.

**Acceptance Criteria:**
- Given `tests/fixtures/presets/d6-pool.json` with Инвентарь and Список заклинаний, when uploaded, then each single sheet shows as one tab and the sheet set gets "+", with no code change for that system.
- Given a sheet of a sheet set, when anyone with write access edits its name field, then its tab, header and token picker show the new name on every client.
- Given a player, when the room has a hidden NPC single sheet, then the player has no NPC tab, no token menu on NPC tokens, and no NPC roll notification.
- Given the GM, when "Очистить всё" is confirmed in a room with a v1 room copy, then every client shows an empty room and the GM can upload a v2 preset.
- Given the checks, when `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser` and `bunx vite build` run, then all pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.
- `bun test src/core/snapshot-size.test.ts` -- prints a margin of at least 1500 bytes.
