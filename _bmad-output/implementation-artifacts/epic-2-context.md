# Epic 2 Context: The Whole Table Sees the Same Sheets

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn the single-GM extension of Epic 1 into a shared room. Edits sync live between all GM tabs and devices, every client catches up to full state when it joins or returns, and players read every character and no NPC. A compressed room copy in room metadata lets a GM re-enter from another device and lets players read when no GM is online. Players see when no GM client answers. This epic builds the room protocol that player edits (Epic 3), rolls (Epic 4) and snapshot import (Epic 5) extend.

## Stories

- Story 2.1: See Edits From Other GM Tabs Live
- Story 2.2: Catch Up on Join and on Return
- Story 2.3: Let Players Read Every Character and No NPC
- Story 2.4: Show Whether a GM Is Answering
- Story 2.5: Save a Room Copy That Survives the GM's Browser
- Story 2.6: Read Characters With No GM Online

## Requirements & Constraints

- Edits to different rows from two GM tabs both stay. Two edits of one row settle on the same latest record on all clients.
- Every GM tab and device can edit. No code elects, tracks or waits for a specific GM client.
- A player client shows every character with its full sheet and no NPC. Hiding is at the interface only: players still hold NPC records.
- Room data survives a reload and re-entry. A GM on a new device gets the data from the room copy.
- With no GM online, a player reads characters from the last room copy. No live edit is exchanged.
- Room metadata is under 16 kB in total and shared with other extensions. Owlbear reports success for a write past the limit and drops it, so the extension checks size before it writes and verifies by read-back.
- No behavior may depend on timers in a hidden GM tab. Chrome timer gaps reach 60 s, and a hidden Chrome tab can freeze after about 13 minutes. A hidden tab that still answers counts as online.
- Room copy size is measured again on the real format. Over 15500 bytes, or under 1500 bytes of margin, is a human gate before Epic 3.

## Technical Decisions

**Room channel.** Room traffic goes on `app.muster-roll/sync` with destination `REMOTE`, as `{ v, g, t, ... }`. In this epic `t` is `commit`, `ping`, `alive`, `state-request` or `state`. Read `v` first: drop any other `v`, and a higher `v` raises the new-version notice. Then a zod schema in `core` parses the message.

**Gate.** One gate in `replica` checks type, sender role and generation before dispatch. It maps `event.connectionId` to role and player id through the party port, and re-reads the party once on a miss. "Known player" means any party member with a known connection id, GMs included. Drop unlisted combinations.

| `t` | Sender | Generation accepted |
| --- | --- | --- |
| `commit`, `reject` | GM | Equal |
| `state` | GM | Equal or higher |
| `reset` | GM | Higher |
| `alive` | GM | Any |
| `propose` | Known player | Equal |
| `ping`, `state-request`, `roll` | Known player | Any |

A client reads its own role and id from the player port and re-reads its role on every party change. A role change enters `catching-up`.

**GM edit.** The edit takes a new `c`, merges, persists and goes out as `commit` through the shared send queue. Pending `commit` batches are coalesced by key.

**Catch-up.** A client enters `catching-up` on start, page visible, Page Lifecycle `resume`, browser `online`, role change, a higher generation, and an `alive` digest from one GM client that differs twice in a row. Steps: a GM client merges its persisted records of the current generation, then the client merges the room copy, then it broadcasts `state-request` with nonce `r`.
- Re-entry keeps the current `r`. A higher generation or a role change issues a new `r` and discards partial answers.
- A GM client that is not `catching-up` answers after a random short delay, unless it has already seen an answer to `r`. `state` echoes `r`, carries `i of n` and holds complete deflated records, each message under the size limit.
- A client leaves `catching-up` when it holds all `n` messages of one responder for its own `r`, or on timeout. A partial answer counts as no answer. Every `state` message merges whenever it arrives, in any state.
- A GM client whose confirmed party read shows no other GM connection merges its persisted records and the room copy, then leaves with no wait.
- Edits made during catch-up wait in the pending queue, one field-patch entry per key, and take `c` on exit. GM intents replay in arrival order. Inputs stay enabled. `replica` refuses preset upload and download commands while `catching-up`.
- When a client's role changes to GM, it persists all held records under the current generation after catch-up ends.

**Liveness.** `replica` alone owns `gmLink`, and the projection carries it to every window. `gmLink` is `online` when a GM-origin message arrived within the timeout. The party list never sets it. A client with no GM-origin message for half the timeout sends `ping`. A GM client that is not `catching-up` answers `alive` on receipt with the generation and a digest, with no timer of its own. The digest is the XOR of a hash of `(k, c, a)` over all records. After a catch-up that held all `n` messages from one GM client, ignore that client's digest until it changes. A timeout exit does not start this ignore.

**Room copy.** The metadata key is `app.muster-roll/snapshot`. Only a GM client that is not `catching-up` writes it, after a pause in edits with jitter and when its page becomes hidden. Steps:
1. Read the copy. If it has a higher `v` or does not decode, stop with the not-saved notice. If it has a higher generation, do not merge or write, and enter `catching-up`. A lower generation is not merged and is overwritten.
2. Merge it. Stop if `resume` or a visibility change falls between the read and the write.
3. Encode all records, tombstones and versions included, with the generation, sorted by key, deflated and base64-encoded, in `core/snapshot`.
4. Measure all room metadata with this key replaced, as UTF-8 JSON. Over 15500 bytes, skip the write and keep the previous copy.
5. Write and read back at once. The read-back must hold every written record at an equal or higher version, or have a higher generation.

A skipped or stopped write, or a trigger during catch-up, schedules the write again. The room copy is not the export file format. Only the room copy holds `acl:`, `plink:`, tombstones and versions.

**Generation.** A generation is `{ n, a }`, starting at `{ n: 0, a: "" }`. On start a client takes the highest generation among its persisted records and the room copy. Only a snapshot import (Epic 5) changes it.

**Platform facts.** `getPlayers` omits the caller. Other GM connections of one account show with role GM and the same player id. Their `connectionId` matches the broadcast sender. A read-back needs no delay.

**Constants.** New timeouts, delays, pauses and jitter go into the existing constants module, so tests can inject them.

## UX & Interaction Patterns

- Until the first catch-up ends, the window shows the tab bar from known data and "Загрузка…", never an empty state. Read the role before any data renders. The no-preset state shows only after the first catch-up.
- For a GM in `catching-up`, upload buttons and "Скачать пресет" are disabled with "Загрузка…". A GM edit during catch-up shows at once, with no mark.
- Player view: character tabs only, with no NPC tab, gear or "+". The header shows "Только чтение". Read-only values take no focus. Repeat sections show no "Добавить строку" or "Удалить".
- Player empty states and their exact strings come from the copy catalog and the story specs.
- A value edited by another client updates in place, unless that field has focus. A focused field keeps its text, and `Esc` returns it to the current value.
- If the active sheet disappears, or the tab is not available to the role, the first available tab becomes active, and an open confirmation closes.
- The banner is a live region and shows one notice at a time, by priority: local save failed, room copy not saved (danger), new version, no GM (warning). Text comes from the copy catalog.
- A GM client never shows the no-GM banner, also when alone in the room. `gmLink` starts `offline`, with no banner until the first catch-up ends.

## Cross-Story Dependencies

- Epic 1 provides merge, persistence, the send queue, message-size splitting, the UI channel projection, the banner and the constants module. This epic adds the room channel and the gate.
- 2.1 adds the gate and live commits. 2.2 builds catch-up and the pending queue on that gate.
- 2.2 replaces the Epic 1 preset gate with the loading state. A player stays on "Загрузка…" after catch-up until 2.3 adds player views.
- 2.3 makes `core/visibility` apply player rules. Until then it passes everything through.
- 2.4 needs the catch-up and digest of 2.2. 2.5 hooks the room-copy merge into 2.2 catch-up. 2.6 needs 2.3, 2.4 and 2.5.
- Epic 3 reuses the pending queue and the gate for `propose` and `reject`. Epic 4 adds `roll`. Epic 5 adds `reset` and generation change. The size measurement in 2.5 is a gate before Epic 3.
