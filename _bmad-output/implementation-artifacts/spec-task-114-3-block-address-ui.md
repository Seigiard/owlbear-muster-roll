---
title: 'TASK-114.3: UI rows, reveal and tab identity carry the block address'
type: 'refactor'
created: '2026-11-18'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md'
  - '{project-root}/docs/adr/0003-a-block-has-one-address-converted-at-the-storage-and-wire-edges.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-114-2-block-address-replica.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After TASK-114.2 the commands carry a block address, but the window still builds it at every consumer: `preset-section.tsx` computes the scope chain four times and `main.tsx` once more, `tokenTargetOf` rebuilds a path from `row.target` or `[sectionId, instanceId]`, three rules decide when a `path` is sent (`path.length > 2`, `parentPath !== null`, and "always" for dice and token targets), reveal serialises the path to JSON into `data-repeat-path` and finds it again by string compare, and a repeat-block tab is identified by a string that encodes the path beside a numeric legacy key. This is the churn hotspot: 46 commits on `main.tsx`, 26 on `preset-section.tsx`, and the "preserve nested paths across consumers" series.

**Approach:** `plainRows` and `repeatBlocksOf` produce one `BlockAddress` per row or block, and dice place, field target, token target, reveal, duplicate, delete and add carry it unchanged. The DOM block element carries the address key in `data-block` and reveal finds it with one selector; the `block-revealed` event, the open request and the tab selection carry an address. The string form of `TemplateTabSelection` becomes `{sourceIndex, block}`; the numeric legacy form, `isLegacyTemplateTabSelection` and the same-`sourceIndex` successor fallback stay. `wireCommand` in `replica-client.ts` remains the only serialisation point. One intended wire change: the dice place sends `path` whenever its block is not null, so a plain row inside a tab block now sends `path:[npc,a]` beside `instanceId` (a LOCAL message both ends ship together; nothing stores it). The Builder preview is not migrated beyond compile edits: architecture-review candidate 3 replaces its own command application with the engine. PR 3 of 3 (TASK-114); depends on TASK-114.2.

## Boundaries & Constraints

**Always:** Keep ADR-0002: rules in the navigation reducer, effects and commands in the component. DOM contracts the e2e suite selects on stay byte-identical: `data-repeat-block={blockId}` on block elements (duplicate.e2e.ts:618, nested-repeat.e2e.ts:466,494, sheet-layout.e2e.ts:370, single-sheets.e2e.ts:500, repeat-blocks.e2e.ts:539, preview-pane.tsx:420,843) and `data-cell-scope` with value `'root'` or the block id (link.e2e.ts:529, open.e2e.ts:406, navigation-v4.e2e.ts:143, repeat-tab-context.e2e.ts:139, nested-repeat.e2e.ts:401, single-sheets.e2e.ts:143). Keep every `SheetBody`, `SheetHeader`, `CellPreview`, `FieldEditing` prop name the preview passes, and the numeric `templateTabKey(number)`/`templateIndexFromKey`. Wire rules from TASK-114.2 hold: triple commands emit `path` iff longer than one pair; `link-set`/`open-sheet` iff non-empty; dice place emits `path` iff `block !== null`. Every e2e journey in `tests/nested-repeat.e2e.ts`, `open.e2e.ts`, `repeat-tab-context.e2e.ts`, `repeat-tabs.e2e.ts` (whole file, including 186-290 and 567-729), `navigation-v4.e2e.ts`, `duplicate.e2e.ts`, `link.e2e.ts`, `single-sheets.e2e.ts`, `repeat-blocks.e2e.ts`, `sheet-layout.e2e.ts`, `builder.e2e.ts` passes with no edit to those files. Assert through roles and labels in tests, never through `data-block`. Lint: `anti-slop/no-array-filter-map`, `anti-slop/no-conditional-empty-object-spread`, `anti-slop/no-object-parameters`, `muster-roll/no-hand-assembled-classname`.

**Never:** Do not change the numeric legacy tab form or `isLegacyTemplateTabSelection` (candidate 5). Do not move `frameLayout`, `gmSheetParts`/`playerSheetParts`, the open-request derivation or the vanished-tab rule out of their current owners beyond what the address needs (candidate 5). Do not migrate `src/builder/preview-pane.tsx`'s command handler or `src/preview/`; compile edits only at the lines the Code Map names. Do not add retry logic to reveal. Do not change interface text (`src/copy.ts`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nested row | block `[npc,a,atk,x]` rendered under a plain section | field-patch, dice place, duplicate, delete and token link all carry that exact address; every wire form shows `path` | — |
| One-pair block | block `[npc,a]` | the same consumers carry `[npc,a]`; triple commands show no `path`; dice place and `link-set` show `path:[npc,a]` (as today) | — |
| Plain row in a tab block | tab block `[npc,a]`, plain row | field-patch target `[npc,a]` without `path` on the wire (as today); dice place now sends `path:[npc,a]` (intended change) | — |
| Reveal nested | `open-sheet` for `[npc,a,atk,x]`, cell `hp` | one `querySelector('[data-block="blk:s:npc:a:atk:x"]')`, then `[data-cell-id="hp"][data-cell-scope="x"]` inside it; tab blocks reveal the same way | not found → nothing is revealed and the request still ends, as today |
| Reveal root | `open-sheet` for the sheet root, cell `hp` | `BlockReveal.block` is `null`; the cell is found in the body with `[data-cell-scope="root"]`, so a block with the same cell id does not match (navigation-v4.e2e.ts:71) | as above |
| Tab identity | repeat-tab block `[npc,a]` selected, then its block deleted | `chosenTemplateTabs` holds `{sourceIndex, block}`; the vanished-tab rule keeps the previous tab until settled; when it settles, the first visible tab with the same `sourceIndex` is selected (successor fallback, repeat-tabs.e2e.ts:368,515) | — |
| Add from a nested section | «+ Добавить» under block `[npc,a]`, scope `atk` | `repeat-block-add` with block `childAddress([npc,a], atk, newId)` | — |

</frozen-after-approval>

## Code Map

State after TASK-114.1 and 114.2 this spec assumes: `TabBlock` = `{scopeId, instanceId, path, block, name}` (114.1 added `block`); `FieldPatchTarget.rep = {block}`; `LinkTarget = {block, cellId?}`; `Command.block`; `OpenSheetRequest` in the store is still wire-shaped (`replica-client.ts:425` serialises back); `wireCommand` delegates to core `wireCommandOf`.

- `src/core/preset.ts:165-177`, `src/core/rendered-tabs.ts:12-37` -- `TabBlock` → `{block, name}`; one exported `sameRenderedTab(a, b)` (replaces `sheet-body.tsx:241` and `main.tsx:959`); new `src/core/rendered-tabs.test.ts`.
- `src/core/dice-roll.ts:44-62` and `src/ui/sheet/dice-button.tsx:29-39,86-96` -- `DiceRow {instanceId, path?, target}` → `{block: BlockAddress | null, target}`; a core `dicePlaceOf(place, block)` serialiser emits `instanceId = blockIdOf(block)` and `path = block.path` whenever `block !== null`.
- `src/ui/sheet/preset-section.tsx` -- `plainRows:919-991` (`tabBlock.path.slice(0,-1)` at 933 → `repeatBlocks(records, parentOf(block), sectionIdOf(block))`; target at 945-958; dice at 978-981) and `repeatBlocksOf:993-1082` (scope path at 1006-1014; the `parentPath !== null` rule at 1029-1037; name at 1045; dice at 1063-1073) build one address per row/block; `SheetBlock:106` carries `block`; filters at 299, 1010, 1023 → `scopePathOf`; `tokenTargetOf:894-917` → `{block: row.block ?? sheetRootAddress(sheetId), cellId}`; `DuplicateCount:737` gets `block`; map mark at 748-759 uses `linkTargetKey({block, cellId})`; block element at 764-776 adds `data-block={blockKeyOf(block)}`, keeps `data-repeat-block`, drops `data-repeat-path`; `SheetSectionProps.parentPath:89` → `parent: BlockAddress`; `BlockSlot:820-858` and the duplicate ask at 571-659 key by `blockKeyOf`.
- `src/ui/sheet/duplicate-count.tsx:98-108` -- `repeat-block-duplicate` from `block`.
- `src/ui/sheet/use-repeat-blocks.ts:14-48,125-164` -- controls keyed by block id stay; `add:125` → `childAddress(parent, sectionId, newInstanceId())`; `remove:145` takes the block; the `parentPath !== null` rule disappears.
- `src/ui/sheet/sheet-body.tsx` -- `BlockReveal:28` → `{block: BlockAddress | null, cellId, focus}` (`null` = root); reveal effect 91-124 and `repeatBlockForPath:249-257` → one `data-block` selector with `CSS.escape`, cell selector keeps `[data-cell-id][data-cell-scope=blockIdOf(block) ?? 'root']`; `renderedTabKey`/`displayedTabKey:126-156`, `hasRepeatBlock:259-272` (`slice(0,-1)` at 265) use the address and `isLiveBlock`; `TabBlockControls:200-312` sends `repeat-block-delete` from `block`; wrapper 226-230 gets `data-block`; `sheetValuesSignature:343-388` (`blk:${sheetId}:` at 365) → `parseBlockKey(k)?.sheetId === sheetId`.
- `src/ui/sheet/preset-cell.tsx:34-47,110,133-182`, `local-field-values.ts:82-91` (`sameTarget` → `sameAddress`), `map-toggle.tsx:18-20`, `use-field-edit.ts:37-41` -- types follow core; no arithmetic.
- `src/ui/main.tsx` -- open-request derivation 339-410: parse the stored wire request once into `{block, cellId}` (`block` null for root), `repeatBlockTabIndex(records, template, block)`, `tokenCellPlace(template, cellId, scopePathOf(block))`, `path?.at(-1)` at 352 and the filter at 376 gone; `clearBlockReveal:327` dispatches `block-revealed {sheet, block}`; `templateTabHasSelection:491-519` compares with `sameRenderedTab`; `openTemplateTab:463-483` matches the identity form by `sourceIndex` + `sameAddress`, keeps the numeric fallback and the same-`sourceIndex` successor fallback at 474-478; `contentSourceIndex:849-853` → `chosen.sourceIndex` (drops `templateTabSourceIndexFromKey`); `creatingBlock:179-183,542-569` → `{sheet, block}` and dispatches `select-template-tab {index, tab: identity}`; `addTabBlock:521-540` → `childAddress(sheetRootAddress(sheetId), scopeId, id)`; shell tab ids at 815-840 and `onSelectTab:916-930` keep `templateTabKey` strings as DOM ids only (never parsed back, except the numeric legacy form).
- `src/ui/navigation.ts:10-15,23,27,44-48,62-74,106-113,151-155,258-308` -- `NavigationBlockReveal.block: BlockAddress | null`; `TemplateTabSelection = number | {sourceIndex: number; block: BlockAddress | null}`; `select-template-tab.key?` → `tab?: identity`; `open-request.tabKey?` → `tab?: identity`; `block-revealed` carries `block`; `samePath:302` → `sameAddress`; `openRequestTransition:258` stores the identity and converts a root request to `block: null`.
- `src/ui/navigation.test.ts:70,306-550` -- reducer cases: `block-revealed` with root, nested and mismatched addresses; `open-request` stores the identity; `select-template-tab` with an identity.
- `src/ui/shell/window-frame.tsx:31-77` -- `templateTabKey(identity)` reads `sectionIdOf`/`blockIdOf` of `identity.block`; `templateTabSourceIndexFromKey:53` deleted if the preview does not use it; `templateIndexFromKey:65` stays.
- `src/ui/picker/link-picker.tsx:73-76,271-294,312,465,474,526-533` -- `link-set` built from `target.block`; one literal instead of two; `picker/main.tsx:78-92` unchanged.
- `src/ui/replica-client.ts` -- nothing beyond TASK-114.2.
- Builder preview compile edits allowed: `preview-pane.tsx:526-527` (`candidate.block.scopeId/instanceId` → `blockIdOf`/`sectionIdOf`); everything else at 23-41, 142-180, 420, 540, 714-740, 843, 915-921 stays as TASK-114.2 left it.
- Tests to fold: `src/ui/picker/link-picker-v4.test.tsx` (205), `link-picker-review-fix.test.tsx` (364), `link-picker-names-v4.test.tsx` (231), `link-picker-viewport-v4.test.tsx` (103) → `link-picker.test.tsx`; `src/ui/sheet/sheet-review-fix.test.tsx` (336) → new `sheet-body.test.tsx`. Update literals in `duplicate-count.test.tsx:70-194`, `local-field-values.test.ts:7-8`, `replica-client.test.ts:73-125,189,441,472,591-607`, `link-picker-reducer.test.ts`.
- E2E owners (no edits): `tests/nested-repeat.e2e.ts:271,310,393,419` (419 is the TASK-109 copied-block journey), `tests/open.e2e.ts:149,253,303`, `tests/repeat-tab-context.e2e.ts:133`, `tests/repeat-tabs.e2e.ts` whole file, `tests/navigation-v4.e2e.ts:71`, `tests/duplicate.e2e.ts`, `tests/link.e2e.ts:160,312,529-533`, `tests/single-sheets.e2e.ts`, `tests/repeat-blocks.e2e.ts`, `tests/sheet-layout.e2e.ts`, `tests/builder.e2e.ts`. No e2e or `tests/support` file selects `data-repeat-path`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/preset.ts:165-177`, `src/core/rendered-tabs.ts`, `src/core/rendered-tabs.test.ts` (new), `src/core/dice-roll.ts` -- `TabBlock {block, name}`, shared `sameRenderedTab`, `dicePlaceOf` -- one tab identity, one dice serialiser.
- [ ] `src/ui/sheet/dice-button.tsx`, `preset-section.tsx`, `duplicate-count.tsx`, `use-repeat-blocks.ts`, `preset-cell.tsx`, `local-field-values.ts`, `map-toggle.tsx` -- rows and blocks carry `block`; delete the scope-chain filters and the `parentPath !== null` rule -- one address per row.
- [ ] `src/ui/sheet/sheet-body.tsx` -- `data-block` attribute, one-selector reveal with the root case, `TabBlockControls` and `sheetValuesSignature` from the address -- reveal by key.
- [ ] `src/ui/navigation.ts`, `src/ui/navigation.test.ts` -- `block-revealed {block}`, identity form of `TemplateTabSelection`, `tab?` on both events, `sameAddress`, root → `null` -- rules stay pure (ADR-0002).
- [ ] `src/ui/main.tsx`, `src/ui/shell/window-frame.tsx` -- open-request derivation and tab selection by address with both fallbacks kept; drop `templateTabSourceIndexFromKey` if unused -- fewer rebuilds.
- [ ] `src/ui/picker/link-picker.tsx` -- `link-set` from `target.block` -- one literal.
- [ ] `src/builder/preview-pane.tsx:526-527` -- compile edit only.
- [ ] UI lock tests -- fold per the Code Map; update literals to addresses.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- extend the `## Deferred from: TASK-114.1 (2026-11-18)` section: the preview's command handler and `src/preview/` keep the wire form until architecture-review candidate 3.

**Acceptance Criteria:**
- Given `grep -rnE "index % 2|_part, index|path\.length > 2|\[sectionId, instanceId\]|parentPath !== null|data-repeat-path|JSON\.stringify\(.*path|\.at\(-[12]\)|slice\(0, ?-[12]\)|blk:\$\{|templateTabSourceIndexFromKey|repeatBlockForPath" src/ui --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx'`, when run, then it returns nothing.
- Given `src/ui/navigation.test.ts`, when run, then it has passing cases for `block-revealed` with a root, a nested and a mismatched address, for `open-request` storing an identity selection, and for `select-template-tab` with an identity; and `TemplateTabSelection` has no `string` member (typecheck proves it: a string literal assigned to it fails).
- Given `src/core/rendered-tabs.test.ts`, when run, then `sameRenderedTab` has passing cases for same, different `sourceIndex`, and different block.
- Given the e2e owners listed in the Code Map, when `bun run test:browser` runs, then every journey passes with no change to those files.
- Given the full check (`bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`), when run at the final commit, then each passes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Reveal, after (`sheet-body.tsx`):

```ts
const scope = reveal.block === null
  ? body
  : body.querySelector<HTMLElement>(`[data-block="${CSS.escape(blockKeyOf(reveal.block))}"]`);
const cellScope = reveal.block === null ? 'root' : blockIdOf(reveal.block);
const cell = scope?.querySelector<HTMLElement>(
  `[data-cell-id="${CSS.escape(reveal.cellId)}"][data-cell-scope="${CSS.escape(cellScope)}"]`,
);
revealElement(cell ?? scope); onRevealed();   // not found: the request still ends, as today
```

The block key is the storage key (`blk:…`), so storage, navigation and the DOM agree on one string and nothing parses it back. A segment never contains `:`, and `CSS.escape` covers the rest.

## Verification

**Commands:**
- `bun test src/ui src/core/rendered-tabs.test.ts src/core/dice-roll.test.ts` -- expected: green, about 2 minutes.
- `bun run typecheck && bun run lint && bunx oxfmt --ignore-path .gitignore --check .` -- expected: clean, about 2 minutes.
- `bun test` -- expected: green, about 3 minutes.
- `bun run test:browser` -- expected: green, about 10 minutes, outside the sandbox; the e2e owners in the Code Map are the proof of the reveal and tab journeys.
- `bun run build` -- expected: success, about 1 minute.
