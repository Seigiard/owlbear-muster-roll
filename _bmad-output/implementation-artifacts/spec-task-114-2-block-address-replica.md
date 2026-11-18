---
title: 'TASK-114.2: Replica commands and composers carry the block address'
type: 'refactor'
created: '2026-11-18'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/docs/adr/0003-a-block-has-one-address-converted-at-the-storage-and-wire-edges.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-114-1-block-address-core.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After TASK-114.1 core owns the block address, but the window-to-engine commands still travel as `sheetId + sectionId + instanceId + path?`, and composers, proposal-queue, pending-edits, room-protocol and engine each rebuild the address from those parts: default `[sectionId, instanceId]`, `slice(0,-2)`, `at(-1)`, scope-path filters, and the `isLegacyInstanceTarget` guard for links written with a wrong scope id.

**Approach:** The internal `Command` and the engine's held open request hold `block: BlockAddress`. The ui-messages zod schemas transform the unchanged v4 wire form into it at parse; `wireCommandOf` and `wireOpenSheetOf` in core write the v4 form back and are the only serialisers. Replica modules stop doing path arithmetic. The owner confirmed that only their own test rooms hold v4 data older than the November 14-16 path fixes, so `isLegacyInstanceTarget` and every `instanceId`-only match are deleted (no test depends on them). Two behaviour changes are intended and named in the matrix: a player's removal of a nested block now also tombstones the links of that block and its descendants (today `unlinkRemovedBlock` reads one level only), and a structurally malformed command (odd `path`, or `path` not ending in its own pair) is dropped at parse like any malformed message instead of answered with `unknown-instance`; no window sends either. PR 2 of 3 (TASK-114); depends on TASK-114.1.

## Boundaries & Constraints

**Always:** The wire JSON of `repeat-block-add`, `repeat-block-delete`, `repeat-block-duplicate`, `link-set`, `field-patch` and `open-sheet` is unchanged: for every existing wire literal, `serialise(parse(x))` deep-equals `x`. Path rule: the triple commands (`repeat-block-*`, the `field-patch` target) emit `path` iff `path.length > 2`; `link-set` and `open-sheet` emit `path` iff `path.length > 0`. The wire edge checks structure only (even length, `path` ends with the pair) and builds the address without validating segments; composers keep `sheetIdSchema`, instance-id and `tokenIdSchema` checks on `command.sheetId` and `blockIdOf(block)`, so `invalid-sheet-id` and `invalid-instance-id` stay engine rejections (engine-client.test.ts:2581-2624, engine-duplicate.test.ts:371, engine-link.test.ts:388-394). Every other composition outcome, verdict, tombstone set and block order is unchanged for every existing engine test. Senders take `z.input` types so an internal `block` can never reach the wire. The instance-id uniqueness rule across sections (`sheetInstanceIds`, `instanceHeldElsewhere`) stays. `scopePathKey` in proposal-queue keeps matching `templateScopes().sectionsByPath` keys. Repeat-tab refusal in pending-edits stays `repeatTabById(template, sectionIdOf(block)) !== null`. `sheetId` stays on the internal command for sheet-level checks; the transform builds the address from that same `sheetId`, so the two cannot disagree. Lint: `anti-slop/no-object-parameters`, `no-conditional-empty-object-spread` (serialisers use two literals, never `...(cond ? {path} : {})`).

**Never:** No change to `room-messages.ts`, record keys or storage. No format bump. Do not migrate `src/ui/**` beyond the smallest compile adapter (TASK-114.3 owns the UI); the window-side `OpenSheetRequest` in projection-store and navigation stays wire-shaped in this PR. Do not touch `src/builder/` or `src/preview/` beyond compile fixes. Do not change test literals in `engine-*.test.ts`; change helper types and plumbing instead. Do not merge proposal-queue into pending-edits here (architecture-review candidate 4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One-pair command | `{type:'repeat-block-add', sheetId:'s', sectionId:'npc', instanceId:'a'}` | parses to `block = [npc,a]`; serialises back without `path` | — |
| Nested command | same with `path:['npc','a','atk','x']` | `block = [npc,a,atk,x]`; serialises with `path` | odd `path`, or `path` not ending in `[sectionId, instanceId]` → parse failure, message dropped (today: `unknown-instance`/`unknown-section` answer; intended change, no window sends it) |
| Invalid id segment | `instanceId: 'a:b'` or `''` | parses (structure is fine); composer answers `invalid-instance-id` as today | — |
| link-set / open-sheet | `{sheetId, cellId}`, `{sheetId, path:['npc','a'], cellId}` | `block` root / `[npc,a]`; serialise emits `path` iff non-empty | odd `path` → parse failure (link-set gains the even refine it lacks; today `unknown-instance`) |
| Add without `path` to a nested section id | `{sectionId:'atk', instanceId:'x'}` where `atk` is nested under `npc` | `unknown-section` (scope path `[atk]` resolves nothing) | today `repeatSectionById` wrote a root-level `blk:s:atk:x`; intended change |
| GM delete tombstones | delete `[npc,a]` with links to `[npc,a]`, `[npc,a,atk,x]`, `[npc,b]` | first two tombstoned by `isSelfOrDescendantOf`, third kept | a link whose path is not live is ignored, never matched by instance id |
| Player removal of a nested block | player proposal removes `[npc,a,atk,x]` which has a link | the link is tombstoned (today it survived: `parseRepKey` read one level) | — |

</frozen-after-approval>

## Code Map

zod 4.6.7: `.refine().transform()` members work inside `z.discriminatedUnion`; `z.input<>` is the wire type, `z.output<>` the internal one. ui-messages composes the triple edge from TASK-114.1's `fieldPatchTargetOf`/`wireFieldPatchTargetOf` and `blockAddress`; it writes no path arithmetic of its own.

- `src/core/ui-messages.ts:137-158,218-251,257-277,443-449,492-565` -- the five command schemas transform to `block` (field-patch at the command level, where `sheetId` is in scope); `openSheetSchema` transforms to `{t, id, block, cellId}`; export `WireCommand = z.input<typeof commandIntentSchema>`, `Command = z.output<…>`, `parseCommand(wire): Command` (throws on failure, for test helpers), `wireCommandOf(command): WireCommand`, `wireOpenSheetOf(request)`; `Command:498` loses `ReadonlyFieldPatchCommand`; `WindowMessage:553` loses `PublicCommandMessage`; `parseWindowMessage:559` takes the wire input type and returns the internal form; `EngineMessage`/sender types stay `z.input`.
- `src/ui/replica-client.ts:34,126-146,163,425-435,465` -- `wireCommand` delegates to `wireCommandOf`; `WireRepeatTarget` deleted; at `:425` the parsed `open-sheet` is serialised back with `wireOpenSheetOf` into `store.setOpenRequest`, so projection-store, navigation and main.tsx keep today's wire-shaped request (TASK-114.3 switches them).
- `src/replica/engine.ts:503,740-792,1345` -- `heldOpen` holds the internal `{id, block, cellId}`; `deliverOpen` sends `wireOpenSheetOf(heldOpen)`; `openRequestTarget:785` returns `{block, cellId}`; `openTargetShown:779` passes the address; `send(message)` keeps the `z.input` type.
- `src/replica/composers.ts` -- `patchOnto:283-343` drops `matchesBlockTarget` (parse did it), uses `isLiveBlock(records, target.block)`; `composeRepeatBlockAdd:406`, `Delete:445`, `Duplicate:477` use `command.block`, `parentOf`, `childAddress`, `hasValidSegments`; copy path at `:530,549` via `childAddress(parentOf(source), sectionIdOf(source), newId)` and `isDescendantOf`; `repeatSectionOf:585` → `repeatSectionByPath(template, scopePathOf(block))` only; `composeLinkSet:691` builds `LinkTarget {block, cellId}`, keeps `invalid-instance-id` before `unknown-instance`, calls `liveLinkTarget`; `blockLinkTombstones:909` takes `(context, block)` and keeps only `isSelfOrDescendantOf`; `sectionBlocks:971`, `nextBlockOrder:1109` take `(parent: BlockAddress, sectionId)`; `commandScopePath:1004` and `matchesBlockTarget:1146` deleted; `sheetInstanceIds:1021` uses `blockIdOf(parseBlockKey(key))`; `validBlockPath:1122` → `isLiveBlock`; the root-key test at `:1165` → `parseBlockKey(k)?.path.length === 0`.
- `src/replica/proposal-queue.ts:270,294-387` -- `strippedPatch`, `movedPatches`, `scopePathKey` use `parseBlockKey`, `scopePathOf`, `parentOf`, `childAddress`; root-key test at `:270` as above.
- `src/replica/pending-edits.ts:32-35,95-120,567-657` -- `edit:108` keeps `repeatTabById(template, sectionIdOf(block))`; `commandsOf:586` rebuilds add/delete from `parseBlockKey(entry.k)` (no `sheetId` from `split(':')`); `repeatTarget:647` returns `{kind:'rep', block}`.
- `src/replica/pending-queue.ts:22` -- unchanged call.
- `src/replica/room-protocol.ts:428-444` -- `unlinkRemovedBlock` passes `parseBlockKey(record.k)` to `blockLinkTombstones` (nested blocks now covered; matrix row 7).
- `src/core/access.ts:358` -- only what TASK-114.1 left: the root-key test; verify `repeatTargetOf` and `instanceHeldElsewhere` are already address-based.
- `tests/support/room-rig.ts:460-465` -- `send(client, wire: WireCommand)` parses with `parseCommand` before `sendCommand`; every test helper that calls `sendCommand` directly does the same and changes its parameter type from `Command` to `WireCommand`: `engine-client.test.ts:272,2016,2681,2685` and its 71 direct calls, `engine-duplicate.test.ts:675,736`, `engine-open.test.ts:680`, `engine-link.test.ts:170,402`, `engine-sync.test.ts:783`, helpers in `engine-preset`, `engine-propose`, `engine-room-copy`, `engine-window-size`, and `repeat-row-review-fix.test.ts`. `engine-open.test.ts:631-640` `requests` getter serialises with `wireOpenSheetOf` so its literals at 181-409 stay.
- UI compile adapters (no behaviour change, TASK-114.3 removes): `src/ui/sheet/preset-section.tsx:945-1092`, `use-repeat-blocks.ts:125-164`, `sheet-body.tsx:274-312`, `duplicate-count.tsx:98-108`, `main.tsx:521-540`, `picker/link-picker.tsx:271-294,526-533` build `block` with `blockAddress(sheetId, path ?? [sectionId, instanceId])` where they build a command today; `builder/preview-pane.tsx:142` starts its handler with `const wire = wireCommandOf(command)` and keeps its wire logic; `preview-records.ts` unchanged.
- Tests: fold `src/replica/repeat-row-review-fix.test.ts` (101) into `engine-blocks.test.ts`; `block-proposals.test.ts` (50) into `proposal-queue.test.ts`; `roll-delivery-v4`/`roll-flow-v4` stay. `src/core/ui-messages.test.ts:133-192,286` and `ui-messages-v4.test.ts:19` change from `toEqual(message)` to a round trip (`wireCommandOf(parsed)`/`wireOpenSheetOf(parsed)` deep-equals the literal). New engine test for matrix row 7 in `engine-propose.test.ts`. Behaviour owners that must stay green: `composers.test.ts`, `pending-edits.test.ts`, `proposal-queue.test.ts`, `room-protocol.test.ts`, `engine-link.test.ts` (30 literals), `engine-propose.test.ts` (20), `engine-blocks.test.ts` (10), `engine-open.test.ts` (8), `engine-duplicate.test.ts` (5), `engine-client.test.ts`.
- No JSON fixture under `tests/` or `src/` records a wire message; the wire is locked only by the TS literals above. `tests/support/room.ts` and the e2e suite read raw wire messages and are unaffected.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/ui-messages.ts` -- transforming command and open-sheet schemas, `WireCommand`, `parseCommand`, `wireCommandOf`, `wireOpenSheetOf`; `Command`/`WindowMessage` without the readonly split; senders typed `z.input` -- one parse edge, one serialise edge.
- [ ] `src/core/ui-messages.test.ts`, `src/core/ui-messages-v4.test.ts` -- round-trip assertions for every wire literal; a table test over matrix rows 1-5 -- proves unchanged wire.
- [ ] `src/ui/replica-client.ts`, `src/replica/engine.ts` -- use the serialisers; wire-shaped request into the store; delete `WireRepeatTarget` and the `instanceId` rebuild -- single serialisation points.
- [ ] `src/replica/composers.ts` -- addresses throughout; delete `commandScopePath`, `matchesBlockTarget`, `isLegacyInstanceTarget`, `repeatSectionById` use -- locality.
- [ ] `src/replica/proposal-queue.ts`, `src/replica/pending-edits.ts`, `src/replica/room-protocol.ts`, `src/core/access.ts:358` -- module calls instead of key arithmetic -- no second address representation.
- [ ] `tests/support/room-rig.ts` and the test helpers listed in the Code Map -- parse wire literals with `parseCommand`; `requests` getter serialises -- literal-stable rig suite.
- [ ] `src/replica/engine-propose.test.ts` -- nested player removal tombstones the block's links (matrix row 7).
- [ ] UI and builder compile adapters per the Code Map -- smallest change; note each in Implementation Notes for TASK-114.3.
- [ ] Fold `repeat-row-review-fix.test.ts` and `block-proposals.test.ts` into their module tests.

**Acceptance Criteria:**
- Given every wire literal in `ui-messages.test.ts` and `ui-messages-v4.test.ts`, when parsed and serialised back, then the result deep-equals the literal.
- Given `grep -rnE "\.at\(-[12]\)|slice\(0, ?-2\)|length % 2|index % 2|\[sectionId, instanceId\]|split\(':'\)" src/replica src/core/access.ts src/core/ui-messages.ts --include='*.ts' --exclude='*.test.ts'`, when run, then it returns nothing.
- Given `grep -rn "isLegacyInstanceTarget\|matchesBlockTarget\|commandScopePath\|WireRepeatTarget\|ReadonlyFieldPatchCommand\|parseRepKey" src`, when run, then it returns nothing.
- Given `git diff master...HEAD -- 'src/replica/engine-*.test.ts'`, when read, then only helper signatures, imports and `parseCommand`/`wireOpenSheetOf` plumbing changed, plus the new matrix-row-7 test; no command literal changed.
- Given the full check (`bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`), when run at the final commit, then each passes.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Parse edge for one command (the other four follow the same form; the pair check and the default path come from the core module):

```ts
const repeatBlockAddWire = z.strictObject({ type: z.literal('repeat-block-add'), sheetId, sectionId, instanceId, path: blockPathSchema.optional() });
const repeatBlockAddSchema = repeatBlockAddWire
  .refine((c) => tripleMatchesPath(c))              // from block-address.ts
  .transform((c) => ({ type: c.type, sheetId: c.sheetId, block: tripleAddress(c.sheetId, c) }));
```

`wireCommandOf` is the inverse: `sectionId = sectionIdOf(block)`, `instanceId = blockIdOf(block)`, and a second literal with `path` when `block.path.length > 2`. For `link-set` and `open-sheet` the second literal carries `path` when `block.path.length > 0`.

## Verification

**Commands:**
- `bun test src/core/ui-messages.test.ts src/core/ui-messages-v4.test.ts src/replica` -- expected: green, about 2 minutes.
- `bun run typecheck && bun run lint && bunx oxfmt --ignore-path .gitignore --check .` -- expected: clean, about 2 minutes.
- `bun test` -- expected: green, about 3 minutes.
- `bun run test:browser` -- expected: green, about 10 minutes, outside the sandbox.
- `bun run build` -- expected: success, about 1 minute.
