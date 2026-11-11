---
title: '5.2 Download a Room Snapshot'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '17a25646ca5e8c765ca0225f35ade1945ccbf0e7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-change-the-preset-over-existing-sheets.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The GM has no copy of the campaign outside the browser and the room. Backlog task: TASK-30, whose three acceptance criteria apply in full.

**Approach:** Add a "Снимок" section to Settings between "Пресет" and "Копия в комнате" with "Скачать снимок" (and a disabled-for-now place for "Загрузить снимок", built in 5.3). The window builds a JSON file with a pure `core/snapshot-file` encoder from the live records it already holds and downloads it with the existing preset download pattern.

## Boundaries & Constraints

**Always:** The file format is defined by one zod schema in `core` that 5.3 will parse. It holds the current `v`, every live sheet with id, kind, name and order, row values, repeat rows with instance id and order, and token links. It holds no `preset`, `acl:`, `plink:`, tombstones or versions. Strings from the copy catalog. Disabled states: no preset → both buttons disabled with "Сначала загрузите пресет."; GM `catching-up` → both disabled with "Загрузка…".

**Never:** Writing to the replica or the room. Including records of deleted sheets, or `link:` records that point at a sheet that is not live. Players see no Settings, so no player path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Download | Preset loaded, sheets exist | JSON file downloads with the content above | N/A |
| Empty room | Preset, no sheets | File with an empty sheet list and no links | N/A |
| Deleted sheet | Tombstoned sheet with live row records left | Not in the file | N/A |
| Stale link | `link:` to a deleted sheet | Not in the file | N/A |
| No preset | Settings | Both buttons disabled, "Сначала загрузите пресет." | N/A |
| Catch-up | GM `catching-up` | Both disabled, "Загрузка…" | N/A |
| Order | Settings | Sections Пресет, Снимок, Копия в комнате | N/A |

</frozen-after-approval>

## Code Map

- `src/core/snapshot-file.ts` (new) -- schema, `encodeSnapshotFile(records)`, `formatSnapshotFile`.
- `src/core/records.ts`, `src/core/token-links.ts` -- key forms and link records.
- `src/ui/settings/*`, `src/ui/preset-actions.tsx` -- the download pattern and disabled reasons.
- `src/ui/copy.ts` -- strings.

## Tasks & Acceptance

**Execution:**
- [x] `core/snapshot-file.ts` -- schema and encoder -- AC 1.
- [x] Settings "Снимок" section with "Скачать снимок" and a disabled "Загрузить снимок" placeholder whose disabled reasons follow AC 2 and 3 (5.3 enables it) -- AC 1 to 3.
- [x] Tests: unit for the encoder (every matrix row that is data) and a schema round trip; e2e for download content, disabled states and section order.

**Acceptance Criteria:** the three criteria of TASK-30.

## Implementation Notes

- `core/snapshot-file.ts` exports `snapshotFileSchema` (strict objects at every level, `v` as the literal `FORMAT_VERSION`, `type` as the literal `muster-roll/snapshot`), `encodeSnapshotFile(records)`, `formatSnapshotFile(file)` and `snapshotFileName(now)`. Story 5.3 still owns the parse function, its failure codes and the `v` check that must come before the structure check.
- File ids take the rule of their record key segment (`keySegmentSchema` in `core/records`); `tokenId` keeps `tokenIdSchema`. A `superRefine` refuses duplicate sheet ids, duplicate token ids, a repeated instance id within one section, and a link to a sheet the file does not hold.
- A live sheet is what `liveSheets()` lists, the same rule as the tabs, so a sheet whose id fits a key but not `sheetIdSchema` is still written. Links come from `liveLinks`, which keeps its stricter id rules, as the token menu and status do. `row:` and `rep:` records join only a live sheet; a tombstoned row or repeat row stays out, and a section with only tombstoned rows is absent. A `row:` with no values is written as `{}`. The encoder does not read the preset; 5.3 drops ids absent from the template.
- `__proto__` is refused as any record key segment, as link data, and as a field id in row values and cells. zod's `z.record` skips an own `__proto__` key in silence, so `dictionaryOf` in `core/records` refuses such an input before the record parses it; the file's `rows` and `repeats` use it too.
- Only dictionary keys (rows, sections, cells) are sorted; fixed objects keep their build order. Integer-like keys come first by number in JavaScript, which is still a fixed order.
- The window builds the file from the records it shows (`visibleRecordMap` for the GM, which is every record). A field still in its typing pause when the GM presses the button is not in the file yet.
- "Скачать снимок" comes first and is `button-primary`, as this spec decides. This differs from the Story 1.5 wording "the upload action comes first", which still holds for "Пресет".
- "Загрузить снимок" renders through the `Button` primitive only when a disabled reason applies (no preset, catch-up). Otherwise it is not rendered until 5.3 builds the import.
- The 2.2 catch-up test counted "Загрузка…" in the whole Settings panel (2). It now counts it in the "Пресет" region, because "Снимок" adds two more.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Edge and Blind: encoder and tabs disagree on a live sheet; a visible sheet can be missing from the backup | medium | Patched: `liveSheets()`; ids by `keySegmentSchema`; test observed red. |
| Edge and Blind: `__proto__` ids written but lost on parse | medium | Patched: refused in record keys and dictionaries (`dictionaryOf`); tests. |
| Blind: schema accepts duplicates and dangling links | low | Patched: `superRefine`; negative tests. |
| Verification and Blind: determinism test misses cell and section sorts | low | Patched; mutations observed red; comments fixed. |
| Blind: empty row and all-tombstoned section behavior unpinned | low | Patched: tests. |
| Blind: placeholder copies `Button` styles and is disabled with no reason | low | Patched: shown only with a reason until 5.3. |
| Blind: catch-up test does not check the state after catch-up | low | Patched. |
| Blind: no feedback after download; Owlbear may block downloads | low | Deferred: live-room check in TASK-32; a "downloaded" message cannot be verified. |

## Design Notes

- File format (decided, gap 7): `{ "v": FORMAT_VERSION, "type": "muster-roll/snapshot", "sheets": [{ "id", "kind", "name", "order", "rows": { "<rowId>": { "<fieldId>": value } }, "repeats": { "<sectionId>": [{ "instanceId", "order", "cells": { … } }] } }], "links": [{ "tokenId", "sheetId" }] }`. Rows and repeats keep the record keys' ids so 5.3 can place values by field id. Sheets sorted by `(order, id)`, repeat rows by `(order, instanceId)`, keys in stable order, so two downloads of the same data are byte-equal (5.4 compares exports).
- `type` tells a snapshot from a preset file; 5.3 refuses a file without it as a bad file.
- File name: `muster-roll-snapshot-YYYY-MM-DD.json` (local date). Pretty-printed with 2 spaces, as the preset download.
- "Скачать снимок" is `button-primary`, "Загрузить снимок" `button-secondary`.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.
