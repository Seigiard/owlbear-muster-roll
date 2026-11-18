---
title: 'TASK-114.1: Core block-address module and core consumers'
type: 'refactor'
created: '2026-11-18'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/docs/adr/0003-a-block-has-one-address-converted-at-the-storage-and-wire-edges.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Core names a repeat block in five forms (the `blk:` key, an even-length `path`, the scope path of its even-indexed elements, the `{sectionId, instanceId, path?}` triple, and `LinkTarget` with a derived `instanceId`), and every consumer converts between them by hand. Each nested-repeat fix repaired one more consumer (76d0305, bc92efb, ff5c71f, 836da18, 3abef2f); there is no locality.

**Approach:** One deep module `src/core/block-address.ts` owns the block address (sheet id + full path of (repeat scope id, block id) pairs; empty path = sheet root) as plain readonly data built only through its functions. Core consumers hold an address and call the module; the v4 storage and wire JSON stay byte-identical and convert at their edge. This is PR 1 of 3 (TASK-114). The window-to-engine `Command` type keeps its wire form in this PR (the field-patch target has no sheet id of its own; TASK-114.2 converts at the command level); replica and ui keep compiling through thin adapters that TASK-114.2 and TASK-114.3 remove.

## Boundaries & Constraints

**Always:** Keep `FORMAT_VERSION` 4 and every v4 JSON byte-identical: `blk:` keys, `link:` data `{s, path?, c}`, snapshot file `blockSchema`/`linkSchema`, `fieldPatchTarget` wire, the five commands and `open-sheet` in ui-messages, `dicePlaceSchema`, and the picker URL built by `tokenCellPickerUrl`. Serialisation rule for `link:` data: `path` iff the path is non-empty. Address data is readonly and has no `sectionId`/`instanceId` members; those are functions. Scope and section lookups in `preset.ts` take a scope path only; the private formula fallback `scopeFieldsAt` keeps its id lookup behind a non-exported helper (TASK-108 owns that behaviour). The module validates structure (even length) and derives everything else; segment validity (`sheetIdSchema`, instance ids) stays where it is checked today, so every engine rejection (`invalid-sheet-id`, `invalid-instance-id`, `unknown-instance`, `unknown-section`) is unchanged in this PR. Follow `.oxlintrc.json`: `anti-slop/no-object-parameters`, `no-array-filter-map`, `no-conditional-empty-object-spread`, `no-shape-in-symbol-names` (no identifier containing "shape"), `require-safety-comment-for-type-assertion`. Tests use `bun:test` with `#given/#when/#then`.

**Never:** No class, no branded type, no format bump, no stored-data migration. Do not change replica or ui behaviour or the `Command` type: adapters only (TASK-114.2, TASK-114.3 own their migration). Do not touch `src/builder/` or `src/preview/` beyond compile fixes. Do not add a test that asserts source absence; do not keep a "lock" test alive by testing an adapter.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Key round trip | `blk:s1`, `blk:s1:npc:a`, `blk:s1:npc:a:atk:x` | `parseBlockKey` → address with path `[]`, `[npc,a]`, `[npc,a,atk,x]`; `blockKeyOf(address)` returns the same string | odd length, empty segment, segment with `:`, other prefix → `null` |
| Derived views | address `[npc,a,atk,x]` | `scopePathOf` = `[npc, atk]`; `sectionIdOf` = `atk`; `blockIdOf` = `x`; `parentOf` = `[npc,a]`; root: `parentOf` = `null`, `sectionIdOf`/`blockIdOf` = `null`, `scopePathOf` = `[]` | — |
| Descendant test | `[npc,a]` vs `[npc,a,atk,x]`, `[npc,a]` vs `[npc,ab,…]`, `[npc,a]` vs itself | `isDescendantOf` true, false, false; `isSelfOrDescendantOf` true, false, true | — |
| Live block | records hold live `blk:s:npc:a` and a tombstoned `blk:s:npc:b` | `isLiveBlock(records, [npc,a])` true; `[npc,b]` and `[npc,b,atk,x]` false; root address true (the sheet's own record is checked by `resolveSheet`, not here) | — |
| Link data edge | `{s, c}` and `{s, path, c}` | parse → `{block: root, cellId}` / `{block: nested, cellId}`; serialise → identical JSON, `path` absent for root; `c` is `cellId ?? ''` as today | malformed or odd `path`, invalid `s` → parse failure as today |
| Wire triple | `{sectionId, instanceId}` and `{sectionId, instanceId, path}` with `sheetId` from the enclosing command | `fieldPatchTargetOf(sheetId, triple)` → one address `[sectionId, instanceId]` or `path`; serialise emits `path` iff `path.length > 2`, as today | `path` present but not ending in `[sectionId, instanceId]` → `null` (adapters map it to today's `unknown-instance` rejection) |
| Dice place | `{…, instanceId: 'a'}` or `{…, instanceId: 'x', path: [npc,a,atk,x]}` plus the template and sheet id | `diceBlockOf(layout, sheetId, place)` → `[npc,a]` (section from the template as today) or `[npc,a,atk,x]`; `instanceId: null` → `null` | mismatch between `path.at(-1)` and `instanceId` → `null`, as today's consistency check |

</frozen-after-approval>

## Code Map

Core has no `.transform()` yet; types come from `z.infer`. zod is 4.6.7: `.refine().transform()` members work inside `z.discriminatedUnion`, `z.input<>` is the wire type and `z.output<>` the internal one. Use that only where this PR owns both sides (link data); the command schemas wait for TASK-114.2.

- `src/core/block-address.ts` (new, leaf: imports nothing from core) -- owns `KEY_SEGMENT`/`keySegmentSchema` (moved from records.ts:10,20) and `blockPathSchema` (array of segments, even length, min 2) so records, snapshot-file, field-patch and dice-roll share one refine; `BlockAddress` readonly `{sheetId, path}`; `blockAddress(sheetId, path): BlockAddress | null` (even length only, no segment check), `sheetRootAddress(sheetId)`, `childAddress(parent, scopeId, blockId)`, `parseBlockKey(key): BlockAddress | null` (segments checked), `blockKeyOf`, `parentOf`, `scopePathOf`, `sectionIdOf`, `blockIdOf`, `isDescendantOf`, `isSelfOrDescendantOf`, `sameAddress`, `hasValidSegments(address)` for composers, `isLiveBlock(records, address)` (replaces link-target.ts:229 `isLiveRepeatBlock`, dice-roll.ts:309 `liveBlockPath`, sheet-values.ts:97 `hasLiveAncestors`; callers that require a non-root block test `path.length > 0` themselves), and the triple edge `fieldPatchTargetOf(sheetId, triple)` / `wireFieldPatchTargetOf(target)`.
- `src/core/records.ts:10-26,110-205` -- import the segment and path schemas from the module; `blockKey`, `rowKey`, `repKey`, `blockPathKey`, `parseBlockPathKey`, `parseRepKey` delegate to it (replica/ui still import them); `repKeyPrefix` has no importer: delete. `linkDataSchema:74` stays here as the storage shape. Never import records.ts from block-address.ts (load-order cycle).
- `src/core/field-patch.ts:30-59,74,83-134` -- internal `FieldPatchTarget = {kind:'row', rowId} | {kind:'rep', block}`; the wire triple schema stays (one copy, exported as `fieldPatchTargetWireSchema` for ui-messages.ts:221 and ui/replica-client.ts); `patchRecordKey(target)` → `blockKeyOf`; `targetFields`, `findPatchField`, `patchedRecord` take the internal target and use `scopePathOf` + `repeatScopeByPath`/`repeatSectionByPath` only. Replica/ui adapters convert with `fieldPatchTargetOf(sheetId, command.target)` and keep today's rejection order (a `null` conversion is `unknown-instance`).
- `src/core/link-target.ts` -- `LinkTarget:28` → `{block: BlockAddress; cellId?: string}`; `linkTargetSchema` (`linkDataSchema.transform`, keeps the `sheetIdSchema` check on `s`) lives here; `linkTargetOf:56`, `linkDataOf:70` (`c: cellId ?? ''`), `linkTargetKey:77`, `sameLinkTarget:83` go through the module; `blockIndex:95` and the `instanceId !== target.instanceId` guard at 205-212 disappear; `repeatBlockTabIndex:124` and `liveLinkTarget:182` take an address; `tokenCellPlace:244` takes a scope path and uses `repeatSectionPlaceByPath`.
- `src/core/preset.ts:400-700` -- add `repeatSectionPlaceByPath(layout, scopePath)` covering repeat tabs (`{tabIndex, sectionIndex: 0}` as today, since `repeatScopeByPath([tabId])` is `null`); delete `repeatSectionById:407`, `repeatScopeById:597` and the id form of `repeatSectionPlace:502`; callers at field-patch.ts:118,127, link-target.ts:146,283, rendered-tabs.ts:24, visibility.ts:255, preset.ts:408,506,522,684 move to the path forms; `scopeFieldsAt:689` keeps its last-resort id lookup through a private helper (formula-evaluate.ts:263,367 and TASK-108). `repeatTabById:400` stays: tabs exist only at depth 0.
- `src/core/preset-migrate.ts:37-55,134,210,309-319,335-350,485-521` -- `RepeatPathParts`/`parseRepeatPath` → `parseBlockKey`; group keys and `stripToTemplate` use `scopePathOf`; the `blockIndex` use at 309-319 goes with `liveLinkTarget`'s new signature; keep migration write order, loss accounting and `templateScopes` (replica/proposal-queue.ts:300).
- `src/core/dice-roll.ts:44-62,241-322` -- `dicePlaceSchema` unchanged (it has no sheet id or section id); add `diceBlockOf(layout, sheetId, place)`; `blockValues`, `blockValuesAtScope`, `liveBlockPath` use the module; the scope lookup at 255 (`repeatScopePathAt`) stays.
- `src/core/visibility.ts:23-25,177,243-282` and `src/core/access.ts:99-101,358,352-489` -- `FieldVisibilityTarget` and `PlayerEditTarget` `rep` branches become `{kind:'rep', block, fieldId?}`; `repeatTargetOf:472` → `parseBlockKey`; `instanceHeldElsewhere:448` compares `blockIdOf`/`sectionIdOf`; the root-key tests `split(':').length === 2` at visibility.ts:177, access.ts:358 and sheets.ts:155 → `parseBlockKey(k)?.path.length === 0`.
- `src/core/token-links.ts:62,111-115,180-385` -- `pickerGroups` builds `LinkTarget` from `childAddress`; `repeatBlockPaths:365` returns addresses; `tokenCells:300` takes a scope path; `tokenCellPickerUrl:111` keeps emitting `linkDataOf` bytes.
- `src/core/sheets.ts:155,209-226`, `src/core/sheet-values.ts:36-110`, `src/core/rendered-tabs.ts:12-37`, `src/core/snapshot-file.ts:20-49,57-169`, `src/core/snapshot-import.ts:139-224` -- replace `path === undefined ? repKey : blockPathKey`, `split(':')`, `.at(-1)/.at(-2)`, `slice(0,-2)`, `filter(i%2===0)` and the `blk:${…}` literal with module calls; `repeatBlocks(records, parent: BlockAddress, scopeId)` replaces the `string | readonly string[]` argument (callers token-links.ts:376, ui preset-section.tsx:933,1013 get adapters); `TabBlock` (preset.ts:165-170) gains `block: BlockAddress` beside its existing `scopeId`/`instanceId`/`path` (TASK-114.3 removes the old fields). Snapshot file schemas keep their bytes and reuse `blockPathSchema`.
- Unchanged: `snapshot.ts`, `state-records.ts`, `room-messages.ts`, `repeat-block-duplicate.ts`, `format-version.ts`, `storage-key.ts`, `formula-*.ts` (scope paths only), `ui-messages.ts` beyond the import of the wire target schema.
- Adapters outside core (compile only, no behaviour change). Trivial `blockAddress(sheetId, path ?? [])`: ui/main.tsx:234-825, ui/picker/{main.tsx:78-88, link-picker.tsx, link-picker-reducer.ts:195}, ui/sheet/{preset-section.tsx:753,945-1092, map-toggle.tsx, preset-cell.tsx, local-field-values.ts, use-field-edit.ts:39,189, sheet-body.tsx:365, sheet-header.tsx:170}, ui/window-view.ts:16. More than trivial, flag each in Implementation Notes: replica/composers.ts (`command.target` via `fieldPatchTargetOf` at 298,314,348,374 with today's rejection order; `blockLinkTombstones:909-947` keeps `isLegacyInstanceTarget` using `blockIdOf(target.block)`; `composeLinkSet:691-740` keeps `invalid-instance-id` before `unknown-instance`; `repeatSectionById:602` → by path from the command's values), replica/proposal-queue.ts:299-382, replica/pending-edits.ts:587-652 (sheet id now from `parseBlockKey(entry.k)`), replica/pending-queue.ts:22, replica/room-protocol.ts:430, replica/engine.ts:778-792 (`openRequestTarget` builds `{block, cellId}`), ui/sheet/dice-button.tsx:86 (dice input type), builder/preview-pane.tsx:146-229,545, builder/preview-records.ts:82, preview/sample-records.ts:102,132.
- Tests to fold: `src/core/records-v4.test.ts` (36, link data round trip) → `block-address.test.ts`; `src/core/token-links-v4.test.ts` (106) → `token-links.test.ts`; `src/core/access-v4.test.ts` (85) → `access.test.ts`; `src/core/preset-migrate-v4.test.ts` (150) → `preset-migrate.test.ts`; `src/core/repeat-row-review-fix.test.ts` (202) → `dice-roll.test.ts` and `snapshot-import.test.ts`; `preset-v4.test.ts` (127) and `ui-messages-v4.test.ts` (19) stay (format, not path). Behaviour owners that must stay green: `link-target.test.ts`, `field-patch.test.ts`, `dice-roll.test.ts`, `sheet-values.test.ts`, `snapshot-file.test.ts`, `snapshot-import.test.ts`, `token-links.test.ts`, `visibility.test.ts`, `access.test.ts`, `preset-migrate.test.ts`, `records.test.ts`, `ui-messages.test.ts`, formula tests, and every `src/replica/engine-*.test.ts`.
- `deferred-work.md` format: append a section `## Deferred from: TASK-114.1 (2026-11-18)` with one bullet.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/block-address.ts`, `src/core/block-address.test.ts` -- create the module and its test (one case per matrix row and error cell, plus `childAddress`, `hasValidSegments`, `isLiveBlock`) -- the one home for the address.
- [ ] `src/core/records.ts` -- move the segment schema out, delegate the key functions, delete `repKeyPrefix` -- storage edge, no import cycle.
- [ ] `src/core/field-patch.ts` -- internal `FieldPatchTarget`, `fieldPatchTargetOf`/`wireFieldPatchTargetOf` -- wire edge for the target, used by adapters now and by the command schema in TASK-114.2.
- [ ] `src/core/link-target.ts`, `src/core/token-links.ts`, `src/core/snapshot-import.ts:217-224` -- `LinkTarget {block, cellId?}`, `linkTargetSchema`, drop `blockIndex` and the instanceId guard -- link edge.
- [ ] `src/core/preset.ts` -- `repeatSectionPlaceByPath`; remove `*ById` lookups; migrate core callers -- one lookup form.
- [ ] `src/core/dice-roll.ts`, `src/core/visibility.ts`, `src/core/access.ts`, `src/core/preset-migrate.ts`, `src/core/sheets.ts`, `src/core/sheet-values.ts`, `src/core/rendered-tabs.ts`, `src/core/snapshot-file.ts` -- replace hand arithmetic with module calls -- locality.
- [ ] Replica, ui, builder, preview call sites listed in the Code Map -- smallest compile-only adapter; record the non-trivial ones in Implementation Notes -- TASK-114.2/114.3 remove them.
- [ ] Core lock tests -- fold per the Code Map; delete only a case the type now forbids.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- `## Deferred from: TASK-114.1 (2026-11-18)`: `src/builder/preview-pane.tsx` and `src/preview/` keep the wire-shaped command handling until architecture-review candidate 3 runs the preview on the engine.

**Acceptance Criteria:**
- Given the module, when `grep -rnE "\.at\(-[12]\)|slice\(0, ?-[12]\)|length % 2|index % 2|_part, index|split\(':'\)|blk:\$\{" src/core --include='*.ts' --exclude='*.test.ts' --exclude=block-address.ts` runs, then every match is scope-path code in `preset.ts`, `formula-evaluate.ts`, `formula-rename.ts`, `token-links.ts` (`tokenCells`) or `dice-roll.ts` (the `repeatScopePathAt` lookup), or one of the three even-length refines in `ui-messages.ts` that TASK-114.2 replaces.
- Given `grep -rnE "repeatScopeById|repeatSectionById|repeatSectionPlace\(|blockIndex\(|isLiveRepeatBlock|hasLiveAncestors|liveBlockPath" src --include='*.ts' --include='*.tsx'`, when run, then it matches only `repeatSectionPlaceByPath` definitions and calls.
- Given every link-data literal in `records.test.ts`, `records-v4.test.ts`, `snapshot-file.test.ts` and `link-target.test.ts` and every wire-triple literal in `ui-messages.test.ts` and `field-patch.test.ts`, when parsed and serialised back, then the result deep-equals the literal; and `git diff master...HEAD -- 'src/core/ui-messages*.test.ts' src/core/snapshot-file.test.ts` shows no changed literal.
- Given `src/core/block-address.test.ts`, when `bun test src/core/block-address.test.ts` runs, then one passing case exists per matrix row and per error-handling cell.
- Given the full check (`bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`), when run at the final commit, then each passes, and no `src/replica/engine-*.test.ts` literal changed.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Storage edge, in link-target.ts (link data `{s, path?, c}` ↔ `{block, cellId}`):

```ts
export const linkTargetSchema = linkDataSchema
  .refine((d) => sheetIdSchema.safeParse(d.s).success)
  .transform((d) => ({ block: blockAddress(d.s, d.path ?? []), cellId: d.c }));
export function linkDataOf(target: LinkTarget): LinkData {
  const { sheetId, path } = target.block;
  const c = target.cellId ?? '';
  return path.length === 0 ? { s: sheetId, c } : { s: sheetId, path: [...path], c };
}
```

Wire triple, in block-address.ts: `fieldPatchTargetOf(sheetId, t)` returns `{kind:'rep', block: blockAddress(sheetId, t.path ?? [t.sectionId, t.instanceId])}` after checking that a given `path` ends with that pair, else `null`; `wireFieldPatchTargetOf` emits `path` only when `block.path.length > 2`. This is today's wire output. `.at(-2)/.at(-1)` arithmetic is allowed only inside block-address.ts.

## Verification

**Commands:**
- `bun test src/core` -- expected: green, about 1 minute.
- `bun run typecheck && bun run lint && bunx oxfmt --ignore-path .gitignore --check .` -- expected: clean, about 2 minutes.
- `bun test` -- expected: green, about 3 minutes.
- `bun run test:browser` -- expected: green, about 10 minutes, outside the sandbox.
- `bun run build` -- expected: success, about 1 minute.
