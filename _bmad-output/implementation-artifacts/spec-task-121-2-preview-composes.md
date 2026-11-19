---
title: 'TASK-121.2: The Builder preview composes through core/compose'
type: 'refactor'
created: '2026-11-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0460c9d03c8b9ab94af05f7b1bac2937bedae681'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/docs/adr/0005-command-composition-lives-in-core-and-the-builder-preview-shares-it.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Builder preview applies `field-patch`, `repeat-block-add` and `repeat-block-delete` with about 140 lines of its own in `src/builder/preview-pane.tsx`: its own version counter `c + 1`, author `'builder'`, lifecycle `l`, block order and tombstone rules. The engine applies the same commands through the composer, so every rule exists twice and each nested-path fix landed in both. `src/preview/sample-records.ts` is a third record factory nobody but one test calls.

**Approach:** The preview's `sendCommand` hands those three command types to `createComposers('builder').compose` (in `src/core/compose.ts` since TASK-121.1) over a `ComposeContext` built from the snapshot records plus a synthetic `preset` record, merges the composed records into the snapshot with `mergeRecords` as the engine does, and keeps the same `setSnapshot` undo step as today. `src/preview/` is deleted. PR 2 of 2 (TASK-121, ADR-0005); the documents landed with the epic branch.

## Boundaries & Constraints

**Always:** The preview's write policy stays in the preview, before composing: `role === 'GM' || template.players === 'edit'`, as today. The context is `mode: 'persisted'`, `isGmPlayer: () => true`, `mint` from one `createVersionMinter('builder')` per pane lifetime, `newRecordId` from `@/core/ids`. The context's `records` is the unfiltered map: `sample ? previewRecords(template) : sourceRecords` (never the role-filtered `renderRecords`, so a player's delete still tombstones links into hidden tabs), plus `{ k: 'preset', d: encodePreset(preset), c: 1, a: 'builder' }`, where `encodePreset(preset)` is memoised on `preset`; that preset record is never written to the snapshot. Write-back: a composed record is a delta (a field patch carries only the changed cells), so for each composed record `mergeRecords(existing, composed)` replaces the snapshot record with the same key, and a record with no existing key is appended; one `store.setSnapshot` per command. A refused compose answers `{ kind: 'answered', answer: undefined }`, leaves the snapshot array identical, and clears `createdTabBlock`, which the tab-add caller sets before the command. `reconcileRecords` in `builder-store.ts` stays. AD-20 holds: `src/builder` imports nothing from `@/replica/**` or `@/platform/**`; `tests/build.test.ts` is unchanged. `blockTools` stays `null`: no «Дублировать…» in the preview. Decision (owner, 2026-11-19): while the draft has a problem the preview turns editing off (`editing: null`, `tabBlockEditing: null`), because the composer decodes the preset through `parsePresetFile` and would refuse every edit; the preview uses the `problems` prop it already receives, so the condition and the counter agree. Lint rules from `.oxlintrc.json` apply (`anti-slop/*`, `muster-roll/no-hand-assembled-classname`, `require-safety-comment-for-type-assertion`).

**Never:** No engine, send queue, replica client or projection store in the builder page. No change to `builder-store.ts` beyond what the deletion of `src/preview/` needs (its `addSheet` minting is a recorded deferral). No roll result display (deferred). No new `src/preview/` replacement: the sample stays `src/builder/preview-records.ts`. No test that asserts source absence, and no parity test that compares the preview with `compose` (it would be a tautology). Do not edit ADR-0005, AD-23 or `deferred-work.md` except to add an entry for a finding.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Field edit keeps the other cells | snapshot `blk:s1` with `c: 3`, cells `name`, `hp`; `field-patch` sheet `s1`, field `hp`, value `7` | `compose` returns `blk:s1` with `c: 4`, `a: 'builder'` and only `cells.hp = [7, 4, 'builder']`; after `mergeRecords` the snapshot record has `name` unchanged and `hp` = `[7, 4, 'builder']`; one undo step | unknown field or unaccepted value → refusal, snapshot array identical |
| Two edits of one field | the record above, then value `8` | second record mints `c: 5` (the minter remembers its last `c` per key) | — |
| Field edit, player | role `PLAYER`, template `players: 'edit'` | composed and merged as above | role `PLAYER` on a non-editable template → not composed, answered, snapshot identical |
| Block add | root `blk:s1` live; `blk:s1:atk:a` (`order: 0`) live; `repeat-block-add` sheet `s1`, scope `atk`, block `b` | one record `blk:s1:atk:b`, `d.order = 1` (direct live siblings only), `c: 1`, `a: 'builder'`, `l: [1, 'builder']`; appended; `createdTabBlock` stays set | duplicate block id or parent not live → refusal, `createdTabBlock` cleared |
| Block delete | `blk:s1:atk:a` live with `c: 2`, `l: [1,'builder']`; a `link:` record names it | tombstone `d: null`, `c: 3`, `l` unchanged; the link gets its tombstone too; descendants are not tombstoned (the composer's rule) | block or an ancestor not live → refusal |
| Sample sheet | `sample` shown, context = `previewRecords(template)`; field edit on the sample root | composed over the sample map: `c: 2`, `set` kept, `order: 1`; merged into the snapshot as a new `blk:builder-preview` record (the sample sheet record itself is not written, as today) | — |
| Other command | `link-set`, `acl-set`, `sheet-create`, `repeat-block-duplicate`, … | answered `undefined`, nothing composed | — |
| Draft with a preset problem | `problems` (AD-22) is non-empty | the preview passes `editing: null` and `tabBlockEditing: null`: fields read as read-only, no «Добавить» on repeat tabs, the problems counter says why; once the problems are gone editing returns | a command that still arrives is refused by the composer (`unknown-field`), snapshot identical |

</frozen-after-approval>

## Code Map

- `src/builder/preview-pane.tsx:140-281` -- today's `sendCommand`: `wireCommandOf` + three branches with their own minting; becomes one context build + `compose` + one merged snapshot write. Keep lines 213-230 (write policy). `fieldPatchTargetOf`, `patchRecordKey`, `findPatchField`, `acceptedFieldValue`, `patchedRecord`, `blockPathKey`, `repDataSchema`, `wireCommandOf` imports go if unused.
- `src/builder/preview-pane.tsx:104-107, 364-379` -- `sourceRecords` (unfiltered snapshot map) and the `sample` flag / `renderRecords`; the `sample` flag and `template` are declared after the `fieldEditing` memo at 140, so move the context inputs above it or the memo hits the temporal dead zone.
- `src/builder/preview-pane.tsx:726-745` -- tab add sets `setCreatedTabBlock` before `sendCommand` and clears it only in `.catch`; a refusal must clear it too.
- `src/core/compose.ts` (after TASK-121.1) -- `createComposers`, `ComposeContext`, `compose` → `Result<VersionedRecord[], RejectionReason>`; `sheetPolicyOf` (242 at baseline) reads the preset from `context.records.get('preset')` and the live `blk:<sheetId>` root for a sheet-set sheet (`src/core/sheets.ts:82-86`); `mintedPatch` (1098-1130) emits only changed cells plus `[null, c, a]` for cells `stripToTemplate` dropped; `composeRepeatBlockAdd` (407) orders by direct live siblings (`sectionBlocks` 942-975) and needs a live parent (438); `composeRepeatBlockDelete` (466-472) needs live ancestors, keeps `l`, adds link tombstones via `blockLinkTombstones` (900-918), tombstones no descendants.
- `src/core/merge.ts:39` -- `mergeRecords(left, right)`; the engine merges every composed record into its replica (`src/replica/engine.ts:484`), the preview does the same into the snapshot.
- `src/core/version-minter.ts` (after TASK-121.1) -- `createVersionMinter(connectionId)` → `{ mint(key, highestKnownCounter) }`, `c = max(highestKnown, lastMinted) + 1`.
- `src/core/ids.ts:21` -- `newRecordId(kind)`; `ComposeContext.newRecordId` is `(kind, role) => string`, wrap as `src/replica/engine.ts:169` does.
- `src/core/preset.ts` -- `encodePreset`; `src/core/records.ts` -- `recordSchema`.
- `src/builder/preview-records.ts` -- `previewRecords(template)`: the sample root carries `set: template.id` (28-34), so the composer resolves it. `src/preview/sample-records.ts` + `.test.ts` -- delete.
- `tests/dice-choice-field.e2e.ts:4, 66-79` -- the only `@/preview` import and the test that used it; delete that test, keep the file.
- `.oxlintrc.json` -- `"@/preview"`, `"@/preview/**"` sit in six override groups (lines 162, 212, 264, 306, 356, 406); remove all six and shorten each message.
- `tests/builder-snapshot.e2e.ts:251-447, 515-658` -- the behavioural owner of edits, repeat blocks, undo; gains one test (read-only while a problem exists), the rest passes unchanged. Note it asserts only the edited cell (291, 263, 475), so the unit test owns "other cells survive".
- `src/builder/builder-store.ts:93, 200-252` -- `BUILDER_AUTHOR`, `setSnapshot`, `addSheet`; unchanged.

## Tasks & Acceptance

**Execution:**
- [ ] `src/builder/preview-compose.ts` -- `previewCompose(snapshot: readonly VersionedRecord[], contextRecords: ReadonlyMap<string, VersionedRecord>, presetData: string, minter: VersionMinter, command: Command): { snapshot: readonly VersionedRecord[]; ok: boolean }` -- builds the context, calls `compose`, merges or appends each composed record; deterministic given the minter; the rules leave the component (ADR-0002's shape).
- [ ] `src/builder/preview-compose.test.ts` -- the matrix rows with literal expected records: other cells survive, `c` 4 then 5, tombstone keeps `l` and tombstones the link, add orders by siblings, refusal returns the same array (`toBe`), sample edit -- the oracle that catches the delta-overwrite bug.
- [ ] `src/builder/preview-pane.tsx` -- `sendCommand` keeps the write policy, calls `previewCompose`, clears `createdTabBlock` on `ok: false`; `editing` and `tabBlockEditing` become `null` while `problems.length > 0`; move the context inputs above the memo; drop unused imports -- the duplicate rules leave the pane.
- [ ] `tests/builder-snapshot.e2e.ts` -- one new test: a draft with a problem shows the preview field read-only and editing returns when the problem is fixed -- the owner's decision has a behavioural owner.
- [ ] `src/preview/` -- delete; `tests/dice-choice-field.e2e.ts` -- delete the first test and the import; `.oxlintrc.json` -- drop the six `@/preview` entries.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- one entry: a sample edit or add appends `blk:builder-preview…` records with no real sheet, as today; `encodeSnapshotFile` iterates per preset sheet so they are ignored, unverified.

**Acceptance Criteria:**
- Given a GM in the preview, when they edit a field, add a repeat block, delete it and press undo three times, then the snapshot returns to its start and every intermediate record carried `a: 'builder'` with counters minted by the composer.
- Given `src/builder/preview-pane.tsx`, when read, then it contains no `c + 1`, no `a: 'builder'` literal and no `l: [` literal.
- Given the repository, when `grep -rn "@/preview" src tests .oxlintrc.json` runs, then it prints nothing and `src/preview/` does not exist.
- Given `tests/builder-snapshot.e2e.ts` and `tests/builder.e2e.ts`, when `bun run test:browser` runs, then every existing test passes with no edit and the new read-only test passes.

## Implementation Notes

- Tests locked first (`2b9ccd4`): `src/builder/preview-compose.test.ts` (five cases, literal records from the I/O matrix) and one new test in `tests/builder-snapshot.e2e.ts`. One locked fixture was corrected in `66e6c83`: a plain-row field patch is addressed by the row's first field id (`plainRow` in `src/core/preset.ts`), so the edits of `hp` in the row `[name, hp]` carry `rowId: 'name'`; the expected records did not change.
- `266af15` adds `previewCompose` and moves `sendCommand` onto it; `ba0a637` keeps the selected field's edit intent while a problem turns editing off, so fixing the problem brings the editor back without another click. The write policy now also guards `repeat-block-add` and `repeat-block-delete`; the tab controls were already gated by the same policy.
- Mutation calibration: four mutations (replace instead of merge, write back only the first composed record, `ok: true` on refusal, no problem gate) each turned the owner test red on its protected assertion.
- `bun test` goes from 3 502 to 3 496 tests: the 11 cases of `src/preview/sample-records.test.ts` leave and five `previewCompose` cases arrive; every other file keeps its count. `test:browser` stays at 583: the dice-choice sample case leaves, the read-only case arrives. The builder chunk is 80 974 B `gzip -9` at `ba0a637`.

## Spec Change Log

## Review Triage Log

## Design Notes

Known differences from today's handler, all accepted: `c` is minted as `max(current.c, lastMinted) + 1`, not `current.c + 1`; a field patch drops cells of fields the template no longer has and nulls stale values (invisible after merge and in a download); add orders by direct live siblings, not every record under the key prefix, so on the sample the new block gets `order: 2`; add needs a live parent and delete needs live ancestors; delete keeps `l` as it is (`undefined` included) and tombstones links; the sample root edit keeps `set` and `order: 1` where today's wrote `{order: 0, cells}` with no `set`, and a sample repeat-field edit now succeeds where today's refused.

```ts
const presetRecord = { k: 'preset', d: presetData, c: 1, a: 'builder' };
const context: ComposeContext = {
  records: new Map([...contextRecords, ['preset', presetRecord]]),
  mint: minter.mint, newRecordId: (kind) => newRecordId(kind),
  isGmPlayer: () => true, mode: 'persisted',
};
const composed = composers.compose(context, command);
if (!composed.ok) return { snapshot, ok: false };
// per record: existing ? mergeRecords(existing, record) : append
```

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .` -- expected: clean (1 min)
- `bun run lint` -- expected: no errors; the `src/builder/**` override still forbids replica and platform (1 min)
- `bun run typecheck` -- expected: no errors (1 min)
- `bun test` -- expected: green, `src/builder/preview-compose.test.ts` included (3 min)
- `bun run test:browser` -- expected: green, `builder-snapshot.e2e.ts` and `builder.e2e.ts` unchanged; outside the sandbox (10 min)
- `bun run build` -- expected: builds; `tests/build.test.ts` green (2 min)
