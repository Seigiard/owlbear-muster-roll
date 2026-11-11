---
title: '5.3 Replace the Room From a Snapshot'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'a45ebbf9e18de83d355f01f05f64f85d7f563f7f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-download-a-room-snapshot.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-change-the-preset-over-existing-sheets.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-save-a-room-copy-that-survives-the-gms-browser.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A campaign cannot move to another room or computer: the snapshot file of 5.2 cannot be loaded, and Epic 2 left full generation adoption open. Backlog task: TASK-31, whose eleven acceptance criteria apply in full and are the source of truth where this spec is shorter.

**Approach:** "Загрузить снимок" reads the 5.2 file. `replica` turns it into records with a pure `core/snapshot` import over the current preset and answers the dropped-value count. After one confirmation the importer takes a higher generation, persists it, writes the room copy, and then broadcasts `reset`. Every client that sees a higher generation (by `reset`, any message, or the room copy) adopts it: drops pending work with "Данные комнаты заменены", keeps its old data until the new generation is complete, then deletes it.

## Boundaries & Constraints

**Always:** Pure import and placement in `core`. Records out at `c: 1`, plus the current `preset` and all `link:` records from the file; no `acl:` or `plink:`. Placement by field id inside the template of the sheet's kind, using the 5.1 scope rules; a type mismatch, an id absent from that template, or a move across a `repeat` boundary drops and counts the value. Nothing is written before the confirmation. Generation order and storage keys as in AD-9 (`mr1:{roomId}:{n}:{a}:{k}`). New delays and backoff in the timing module. Strings from the copy catalog. The owner accepted the table trust model for home use: a higher-generation room copy is adopted as the plan says.

**Never:** Changing the snapshot file format of 5.2. Answering `state-request`, `ping` or `propose`, or writing a room copy, while this client's generation is incomplete. Deleting the old generation's data before the new one is complete.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enabled | Preset loaded, GM live | "Загрузить снимок" enabled (`button-secondary`) | N/A |
| Valid file | Upload | "Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?"; with drops, add "Не войдут значения удалённых полей: {count}."; focus on "Отменить" | N/A |
| Bad file | Not JSON, wrong shape, wrong `type`, too large | 1.5 bad-file message under the button with a reason; nothing changes | N/A |
| Newer file | Higher `v` | 1.5 newer-file message; nothing changes | N/A |
| Type mismatch | File value type ≠ field type | Dropped, counted | N/A |
| Moved field | Id in the template, other row | Placed by field id | N/A |
| Gone field | Id absent from the template or across a `repeat` boundary | Dropped, counted | N/A |
| Close rules | Block open: cancel, Escape, leaving Settings, window close, catch-up starts | Block closes, nothing written | N/A |
| Changed count | Preset changed between upload and confirm | Count recomputed; if it differs, the block shows the new text and asks again | N/A |
| Confirm | GM confirms | Higher generation → persist → room copy → `reset` | N/A |
| Persist fails | Local write of the new generation fails | Stops before the room copy and `reset`; local-save notice; nothing changes (incomplete data removed) | N/A |
| Copy too big | Over 15500 or read-back fails | Import still finishes, `reset` goes out, not-saved banner, any lower-generation room copy removed | N/A |
| Links | File links | Work where the token exists; inert otherwise | N/A |
| Adopt | Client sees a higher generation (`reset` from a GM, any message, room copy) | Drops pending queue (player entries and GM intents) with "Данные комнаты заменены"; runs catch-up | N/A |
| Incomplete | New generation not complete | Stays `catching-up` past timeout; no room copy write; no answers to `state-request`, `ping`, `propose`; repeats `state-request` with backoff | N/A |
| Complete | All `n` messages of one responder, or a decoded room copy of the new generation | Old generation data deleted; leaves catch-up | N/A |
| Start | Client starts after an import | Takes the highest complete generation among persisted records and the room copy | N/A |
| Players | After import | Read-only, no owner | N/A |

</frozen-after-approval>

## Code Map

- `src/core/snapshot-file.ts` -- the 5.2 schema; add `importSnapshot(file, preset)` → `{ records, count, digest }` (or a new `core/snapshot-import.ts`).
- `src/core/preset-migrate.ts` -- scope and section rules to reuse.
- `src/core/storage-key.ts`, `src/replica/record-store.ts` -- generations in storage, completion marker, deletion.
- `src/core/room-messages.ts` -- `reset` message; gate table already lists it.
- `src/replica/engine.ts` -- import command path, adoption, incomplete state, start-up choice.
- `src/ui/settings/snapshot-actions.tsx`, `src/ui/copy.ts` -- button, confirmation, file errors.

## Tasks & Acceptance

**Execution:**
- [x] `core` -- import with placement, drop counting and digest -- AC 2, 3, 4, 6, 10.
- [x] `replica` -- `snapshot-check { requestId, data }` → `{ count, digest }`; `snapshot-import { data, expectedDigest }` recomputes, asks again on a changed digest, then runs the import order -- AC 1, 5, 6, 7.
- [x] `replica` -- `reset`, adoption, incomplete state, completion, deletion of the old generation, start-up choice, GM intent queue drop -- AC 9, 10.
- [x] `ui` -- enabled button, confirmation (1.7 close rules plus catch-up), file errors, notification -- AC 1, 2.
- [x] Tests: unit for import (each drop rule, placement, links, no acl/plink, `c: 1`); engine for the import order, persist failure, copy too big, adoption via `reset`, via another message and via the room copy, incomplete behavior (no answers, no copy write, backoff), completion and deletion, start after a partial import, players read-only; e2e for confirm/cancel, bad and newer files, a second GM and a player seeing "Данные комнаты заменены" and the imported data -- every matrix row.

**Acceptance Criteria:** the eleven criteria of TASK-31.

## Implementation Notes

- **Gap 13, trust (owner decision):** the owner accepted the table trust model for home use. Any client that reads a room copy of a higher generation adopts it, and the engine does not check who wrote that copy. A participant who forges such a copy can replace the room for everyone. The owner said that this can happen, but that it is unlikely for home use. No check was added.
- **Core:** `src/core/snapshot-import.ts` holds the file parse, the deflated window-to-replica data and `importSnapshot`. The parse strips a UTF-8 byte order mark. The parse order is size, JSON, `v`, `type`, structure. A file with no `v` is `unsupported-version`, unless it has another `type`: then it is `not-snapshot`. A file with `v: 1` and another `type` (a preset) is `not-snapshot`. `importSnapshot` reuses `templateScopes`, `holdsValue`, `keptValues`, `sectionTarget` and `erasedDigest` from `preset-migrate.ts`, so the digest and the section rule are the 5.1 ones. A dropped value is named `key\0fieldId` with the key that the file gives. A non-repeat value goes by field id to the row that holds the id now. The value in that row of the file comes first, so a stray copy of the id in another file row is dropped and counted. A file repeat section takes, as its fields, its field ids, each typed by the first of its values that fits a type. `sectionTarget` then counts only the ids that keep their type, and the section-id match counts only when it keeps a field. When two file sections merge into one current section, the section with the current id goes first, then the others by file id. Each next group is shifted after the highest order so far. A repeat row whose instance id is already taken in that section is dropped with all of its values.
- **Messages:** the check is the window message `snapshot-check { t, id, data }` (the spec says `requestId`; `id` follows the other window requests). The answer is `snapshot-check-result { id, count, digest }`. The import is the command `snapshot-import { data, expectedDigest }`. It is answered by `snapshot-imported { id }`, or by `command-rejected` with `count-changed` (with the new count and digest), `invalid-snapshot`, `too-large`, `preset-required`, `preset-unreadable`, `write-failed`, `catching-up`, `importing` or `data-replaced`. While an import runs, every GM write command and every check is refused with `importing`, so no commit of the new generation reaches the room before the room copy and `reset`. A check is refused with `write-failed` when the GM client could not read its storage. A queued intent that a higher generation drops is rejected with `data-replaced`.
- **Import order in the engine:** check the digest, flush the outbox (a held commit goes out under the old generation), write the incomplete marker, write every record, remove the marker, replace the replica (new `engineId`, `sequence` 0), write the room copy (after any write in flight), send `reset`, remove the generations below the new one, then answer. The copy write reads the room first: a copy of a higher generation is adopted, not overwritten. The read-back is checked the same way, and the removal of a lower copy reads the room again first. After each await, the import checks whether the client stopped or left its generation; if so, it rejects with `data-replaced` and sends no `reset`. A save failure removes the partial generation, shows the local-save notice and rejects with `write-failed`. The room is not changed. A room copy that does not fit shows the not-saved notice and removes the lower copy. `reset` is still sent.
- **Adoption:** a GM message of a higher generation, a `reset`, or a room copy of a higher generation starts adoption. The client drops its outbox (a held commit would compose with the new generation when it sends), its proposals and its queued intents. If it held data, it shows "Данные комнаты заменены" once. Incoming records, a commit of the target generation included, are staged apart from the replica, so the window keeps the old data until the new generation is complete. Adoption completes on all parts of one answer at the target generation, or on a decoded room copy of it; in the second case the client notes that the copy exists. Until then the client stays `catching-up`, asks again with backoff (`incompleteRequestStartMs` 2000, doubling, `incompleteRequestMaxMs` 30000, less up to a quarter of jitter from the engine's random source), answers no `state-request`, `ping` or `propose`, and writes no room copy. On completion it saves the generation with the marker, removes the marker, removes the lower generations and leaves catch-up. If that save fails, it removes the part saved, keeps its old generation in storage and in the replica, shows the local-save notice, and stays incomplete, so the next answer or copy tries again.
- **Local-save notice:** a failed save of a new generation sets one mark instead of record keys. The mark goes with the next record that saves. Replacing the replica clears every problem key of the old generation, but keeps the unreadable-storage mark.
- **Start:** `loadReplica` first removes every generation that has the marker, then every generation below the highest complete one (a run that stopped before its cleanup). `readHighestGeneration` skips a marked generation.
- **Window:** the check waits `presetRequestTimeoutMs` (15 s). The import waits `snapshotImportTimeoutMs` (60 s), as it writes the room copy before it answers. On that timeout the window shows "Ответ не пришёл. Проверьте листы, прежде чем загружать снова.", and a late `snapshot-imported` for that id clears the message. Each rejection reason has a text (`src/ui/settings/snapshot-text.ts`); a reason with no case shows the failed-import text. When catch-up closes the block, the focus goes back to "Загрузить снимок" once the button is enabled again, unless the GM moved it meanwhile.
- **Accepted (review):** a generation that never completes (the importer left, and its copy did not fit) keeps every client in catch-up until a GM client of that generation answers, as AC 9 says. A repeat field id that the current template has in another repeat section than the one the file section maps to is dropped and counted, as a move across a boundary.
- **Old tests replaced:** four Epic 2 tests pinned the rule that a higher generation is not merged. They now check adoption: `engine-catch-up` (a GM adopts a complete higher state), `engine-room-copy` (twice: the writer adopts a higher copy and does not overwrite it), and `engine-no-gm` (a player with records adopts a higher copy). The 5.2 e2e tests that expected no import button now expect it to be enabled (`snapshot.e2e.ts`, `catch-up.e2e.ts`). AC 8 is checked in the mock: the open item of a token that the file links opens its sheet. The mock has no scene, so a link to an absent token is shown only as harmless: nothing can press it.
- **Known limits:** after a successful import, the window shows no message of its own; the new data is the signal. A role change during adoption is not handled apart from the existing role rules.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Verification: an adopting GM's held commit goes out under the new generation with old records | high | Patched: outbox `drop()` on adoption; tests for adopter and importer flush. |
| Edge: GM commands run while the import awaits its copy, breaking the AD-9 order | high | Patched: refused with `importing`; test. |
| Blind and Edge: import overwrites or removes a higher copy; stale `reset` after a superseding generation | high | Patched: read before write, re-read before remove, `importSuperseded` after each await; concurrent-import test. |
| Blind, Edge and Verification: failed adoption save moves persistence to the marked generation; edits lost on restart | high | Patched: old generation kept, notice shown, retry; test observed red. |
| Blind and Edge: `problemKeys` never clear after an import | medium | Patched; test. |
| Edge: old generations left if stopped before cleanup | low | Patched: cleanup at start. |
| Blind and Verification: no jitter; backoff cap unobserved | low | Patched; test observes the cap. |
| Blind: room copy shown as none after adoption from the copy | low | Patched. |
| Blind and Edge: 15 s window timeout reports failure for a finished import | medium | Patched: 60 s, honest text, late success clears it. |
| Blind and Edge: some rejections close silently | low | Patched: text per reason; unit test. |
| Blind: catch-up close drops focus; close rule untested | low | Patched; e2e. |
| Blind: check allowed when import cannot succeed | low | Patched. |
| Blind: second `sectionTarget` with other rules | medium | Patched: shared helper. |
| Edge and Verification: stray duplicate field value can win; untested | low | Patched: own row first; test. |
| Edge: BOM refused; no-`v` object misreported | low | Patched. |
| Verification: fresh client notification, staged commit during adoption, count-changed e2e, AC 8 link e2e untested | medium | Patched: tests. |
| Blind: always-true storage assertion in e2e | low | Patched. |
| Edge: a generation that never completes keeps clients in catch-up | low | Accepted per AC 9; recorded. |
| Edge claim: repeat ids from another repeat section dropped | low | Accepted as boundary moves; recorded. |
| Gap 13: a forged higher-generation room copy is adopted | medium | Accepted by the owner (home use). |

## Design Notes

Decisions for the epic-context gaps:
- **Gap 8, file errors:** reuse the 1.5 bad-file message and its reason wording where it fits (not JSON, too large, wrong structure); a file whose `type` is not `muster-roll/snapshot` is a bad file with the reason "это не снимок". File byte limit: 1 MiB, as the preset.
- **Gap 9, incomplete generations in storage:** before writing a new generation's records, write a marker key for that generation meaning "incomplete"; remove it when the generation is complete (importer: after all records persisted; adopter: on completion). On start, a generation with the marker is ignored and its keys deleted; the highest generation without the marker wins. Generations stored before this change have no marker and count as complete.
- **Gap 10, generation value:** the new generation is `{ n: max(own.n, highestSeen.n) + 1, a: <importer's connection id> }`. `reset` carries only `{ v, g, t: 'reset' }`; data arrives through catch-up (`state`) or the room copy.
- **Gap 11, a generation that never completes:** follow AC 9 (stay `catching-up`, backoff). The window keeps showing the old data with the existing "Загрузка…" states; no new UI.
- **Gap 12, room copy rules:** any client (not only one with no records) that reads a room copy of a higher generation adopts it; a decoded copy of the new generation completes it at once. A player with no GM reads the new copy (2.6) once adopted. A room copy of a lower generation is still not merged.
- **Gap 13, trust:** accepted by the owner (home use). Record it in Implementation Notes.
- **Gap 14, ids and limits:** keep the file's ids (links refer to them). Sheet names pass the sheet name rules; a record that does not fit one message, or an invalid name, makes the file a bad file ("слишком большой" / "неверная структура").
- **Gap 15, repeat rows:** a file `rep:` section maps to the current repeat section that holds the file's section id; otherwise to the one holding the most of its field ids, ties by template order; none → all its values dropped and counted. Orders are kept, shifted on a merge as in 5.1.
- **Gap 16, confirmation:** the block lives in Settings, closes on cancel, Escape, leaving Settings, window close, and catch-up start; confirm recomputes the digest against the current preset and asks again on a difference.
- **Gap 17:** the GM intent queue held during catch-up is dropped on a higher generation, with the same notification.
- Backoff for incomplete `state-request`: start 2000 ms, doubling, max 30000 ms (`incompleteRequestStartMs`, `incompleteRequestMaxMs`).

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: download a snapshot, import it in a second room, check sheets, links, read-only players; a second GM tab sees "Данные комнаты заменены".
