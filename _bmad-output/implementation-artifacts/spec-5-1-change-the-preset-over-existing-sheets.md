---
title: '5.1 Change the Preset Over Existing Sheets'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'fab44cb8194a1857f0017b4d7f72a0715c0e41a0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-see-when-an-edit-is-waiting-for-a-gm.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After the first sheet exists, the GM cannot upload a changed preset (Story 1.5 blocks it), so the format cannot grow during a campaign. Backlog task: TASK-29, whose nine acceptance criteria apply in full and are the source of truth where this spec is shorter.

**Approach:** Unblock "Загрузить пресет". On upload, `replica` runs one pure `core/preset` diff over the full replica and answers the window with `{count}` of stored values to erase. With `count > 0` the window shows one confirmation; on confirm the replica diffs again and either asks again with the new count or writes one ordered batch: new-key rows, then `preset`, then tombstones and stripped rows. Every later write that mints a new `c` strips ids absent from the template.

## Boundaries & Constraints

**Always:** The diff and the migration plan are pure functions in `core/preset` (or a new `core/preset-migrate.ts`) over records and two presets. Count rules: a removed field id that holds a value counts; a key present with `false` holds a value; a field whose type changes under one id counts as removed; a field moved across a `repeat` boundary counts as removed. Generation unchanged. The send order and the local persist order are both: new-key rows → `preset` → tombstones of old keys and stripped rows. Refused while `catching-up`. Strings from the copy catalog.

**Never:** A generation change. Changing the format version. Rewriting the `d` of a player's proposal on the GM.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enabled | Sheets exist | "Загрузить пресет" enabled; 1.5 temporary reason gone | N/A |
| Removes nothing | Diff count 0 | Batch written at once; "Формат листов изменён." under the button | N/A |
| Removes values | Count N > 0 | "Значения удалённых полей будут стёрты: {N}. Загрузить пресет?" focus on "Отменить" | N/A |
| Cancel | "Отменить" | Nothing changes | N/A |
| Catch-up | Confirmation open, catch-up starts | Block closes, nothing written | N/A |
| Changed replica | Confirm, new count M ≠ N | Block shows M, focus to "Отменить", second confirm needed | N/A |
| Changed to zero | Confirm, new count 0 | Block closes, removes-nothing path | N/A |
| Move | Field id now in another non-repeat row | Value moves to the `row:` record of the row that holds it now | N/A |
| Type change | Same id, other type | Counted, erased | N/A |
| Repeat survives | ≥1 id of a repeat row survives in a repeat row | Every `rep:` moves to the new `sectionId` with `instanceId`, `order`, surviving values; removed ids counted | N/A |
| Repeat gone | No id survives | `rep:` tombstoned; all its values counted | N/A |
| Boundary | Id moves between non-repeat and repeat, or between two repeat sections | Counted as removed | N/A |
| New field | Added id | Empty on all clients | N/A |
| Renamed label | Same id, same type | Keeps its value | N/A |
| Strip later | Any write minting a new `c` (GM edit, player proposal, NPC duplicate) | Ids absent from the template of the sheet kind, and values of the wrong type, are stripped | N/A |
| Roll | Formula names a removed field | 4.2 bad formula message; nothing sent | N/A |
| Player pending | Player has a pending edit of a removed field | Removed ids stripped from the entry silently; an entry with nothing left is dropped silently (no "Нет прав на правку") | N/A |
| Unreadable stored preset | Stored `preset` does not decode | Upload refused; message "Сохранённый пресет не читается. Обновите расширение." | N/A |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts`, `src/core/field-patch.ts`, `src/core/records.ts` -- template scopes, `firstFieldId`, patch composition, key forms.
- `src/replica/composers.ts`, `src/replica/engine.ts`, `src/replica/commit-outbox.ts`, `src/replica/persistence*` -- `preset-upload`, ordered batch, persist order.
- `src/replica/proposal-queue.ts` -- strip pending entries on a preset change.
- `src/core/ui-messages.ts` -- diff request/answer, count-changed rejection.
- `src/ui/settings/*`, `src/ui/copy.ts` -- button, confirmation block, success line.

## Tasks & Acceptance

**Execution:**
- [ ] `core` -- `presetDiff(records, oldPreset, newPreset)` → `{ count, plan }`, where the plan lists new-key records, moved records, tombstones and stripped records per sheet kind -- AC 2, 6.
- [ ] `core` -- `stripToTemplate(record, preset)` used by every composer that mints a new `c` (GM field patch, repeat add, NPC duplicate) and by the player before proposing -- AC 7.
- [ ] `replica` -- `preset-diff { requestId, data }` answered with `{ requestId, count }`; `preset-upload { data, expectedCount }` recomputes, rejects `count-changed` with the new count, or writes the ordered batch; refused while `catching-up` -- AC 2 to 6, 9.
- [ ] `replica` -- player strips pending entries after a preset change -- matrix.
- [ ] `ui` -- enabled button, confirmation block (1.7 pattern), focus rules, success line -- AC 1, 3, 4, 5.
- [ ] Tests: unit for the diff and plan (every count rule, move, repeat survive/gone, boundary, type change, `false`), strip; engine for order of sends and persists, count-changed, catch-up refusal, player strip; e2e for cancel, confirm, second confirmation, removes-nothing, catch-up closing, new field empty, roll on a removed field -- every matrix row.

**Acceptance Criteria:** the nine criteria of TASK-29.

## Implementation Notes

- The plan is flat, not grouped per sheet kind: `presetDiff` returns `{ count, digest, removed, first, last }`. `first` holds the writes that go before `preset` (rows under new keys, rows that gain values); `last` holds the writes that go after it (tombstones, stripped rows). Each sheet is read against the template of its own kind; only `removed` lists field ids per kind.
- Taken key: a moved repeat row's new key is taken only when a live row stays at that key after the upload, or another moved row claimed it first. A tombstone, or a live row that moves away, does not block it, so an A→B→A round trip moves the rows back with count 0. A claimed key is never tombstoned by the row that leaves it.
- Retry after a stopped batch: when the record at a moved row's new key already holds the cells the move would write, the plan only tombstones the old key and counts nothing for that row.
- Merged sections: the old section with the new section's id comes first and keeps its `order`; each next old section, in old template order, shifts so its lowest `order` comes after the highest so far.
- Confirmation safety: `preset-diff-result` carries `count` and `digest` (FNV-1a over the sorted erased `(key, fieldId)` pairs). `preset-upload` carries both back as `expectedCount` and `expectedDigest`. With a count above 0, a different count or digest is refused `count-changed`, which has its own schema branch with a required `count` and `digest`.
- A batch that stops at a failed write is refused `write-failed` ("Не удалось сохранить пресет. Попробуйте ещё раз."). `not-allowed` shows "Загружать пресет может только мастер.". `compose()` refuses `preset-upload` (`not-allowed`); only `composePresetUpload` builds the batch.
- The window disables the upload with "Загрузка…" while a diff or upload waits. With no answer after `presetRequestTimeoutMs` (15000) it goes back to idle with the write-failed message, and a late answer for that id is ignored. Command sends happen in an effect keyed by request id, never while a state is computed. "Формат листов изменён." shows after every upload that the engine reports done.
- A player's pending entries follow a preset change: a row field moves to the new row that holds its id (a patch can split); a repeat row patch, a removal too, moves to the new section of its section. An entry with nothing that maps drops in silence. A moved part that lands on a key with its own entry merges into it (the existing values win).
- Accepted, not patched:
  - A key present with `false` counts as a value.
  - A second GM client still on the old preset can write an old key again after the upload.
  - A merged row over the message limit is refused `too-large`; no test covers it.
  - The confirmation shows only the count, not which fields go.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind, Edge and Verification: a tombstone at the new key counts as taken, so A→B→A erases repeat rows | high | Patched: only live staying records or claimed keys; round-trip test. |
| Edge: retry after a partial batch counts its own new-key rows as erased | medium | Patched; test. |
| Blind: merged sections keep duplicate `order` | low | Patched: shift after max; test. |
| Edge: confirm checks only the count; another value set with the same count is erased | medium | Patched: erased-set digest; test. |
| Blind, Edge and Verification: a partial batch sends no answer; window waits forever; stop-on-failure untested | high | Patched: `write-failed`, 15 s timeout, busy state; failure test. |
| Blind: side effects inside `nextState` | low | Patched: send keyed by request id. |
| Blind: silent window after a confirmed erasing upload | low | Patched: "Формат листов изменён." for both paths. |
| Blind: `count` optional for every rejection; `not-allowed` silent | low | Patched: separate schema branch; message. |
| Blind: `compose()` still flattens `preset-upload` | low | Patched: refuses. |
| Edge: player pending edits of moved rows dropped | medium | Patched: re-keyed by the migration rules; tests. |
| Verification: NPC duplicate strip untested | low | Patched: test observed red. |
| Blind: unused `removed`; confirmation shows only a count | low | Accepted: AC text fixed; recorded. |
| Blind: `false` in a check counts as a value | low | Rejected: AC 2 requires it. |
| Blind: a second GM on the old preset can resurrect an old key | low | Deferred: recorded. |
| Verification: merged row over the message limit untested | low | Deferred. |
| Edge claim: plan is flat, not per kind | low | Spec wording updated in Implementation Notes. |

## Design Notes

- Decided (gap 1): the window keeps the new preset text while the block is open; other windows see nothing until the batch commits. `count-changed` carries the new count. A new count of 0 on confirm applies at once.
- Decided (gap 2): the upload flushes the current outbox first, then sends the three groups as separate ordered commits; persistence writes them in the same order. A closure between groups leaves values readable under one of the two presets.
- Decided (gap 5): a value's scope is its record form. A `row:` value survives when the new template has the id in any non-repeat row with the same type. A `rep:` value survives when its id is in the same new repeat section with the same type. The new section of an old repeat section is the new repeat row that holds the old `sectionId`; else the one holding the most surviving ids, ties by template order.
- Decided (gap 6): an undecodable stored preset blocks upload, because it may come from a newer build.
- A field that holds `''` or no key holds no value; `false` and `0` hold a value.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.
