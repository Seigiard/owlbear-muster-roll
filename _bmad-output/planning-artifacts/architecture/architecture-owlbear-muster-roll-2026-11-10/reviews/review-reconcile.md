# Reconcile review: ARCHITECTURE-SPINE vs spec-muster-roll

Date: 2026-11-10
Compared: `ARCHITECTURE-SPINE.md` against `SPEC.md`, `preset-format.md`, `storage-and-sync.md`, `stack.md`.
Rule used: absence from the spine alone is not a finding. A gap is a finding only when two builders of separate units could make incompatible choices, or when a spec requirement cannot be met as the spine is written.

## Verdict

**Revise before build. Do not rewrite.**

The core of the spine serves the spec: peer replicas, one merge, GM validation, snapshot read-merge-write, generation on import. The spine has no conflict with a non-goal.

Five items block a build:

1. AD-5 drops two message types that the spec needs (C-1).
2. AD-2 stores values by preset row. The spec stores values by field id (C-2, C-3).
3. AD-7 can end catch-up on an empty answer (C-4).
4. AD-6 has no message to measure in a quiet room (C-5).
5. No AD carries the CAP-13 import rules (G-1).

## Status of the requirements named in the request

| Requirement | Status | Where |
| --- | --- | --- |
| Size check before the snapshot write | Landed. One defect in the verify step | AD-8, G-5 |
| One confirmation for an upload | Not carried | G-3 |
| Snapshot import drops unknown field ids and shows the count | Not carried | G-1 |
| Import resets player links and write rights | Not carried | G-1 |
| Import restores a token link where the token exists | Not carried. The port is also missing | G-1, G-2 |
| GM moves to another device | Partly carried. Snapshot content is not fixed | G-4 |

## Part 1: Contradictions

### C-1. AD-5 drops `state-request` and `roll` [High]

- **Spec:** CAP-6: "Anyone who can see a sheet can roll its dice cells." "`1d20 <= str - 2*str_tired` with filled fields rolls once, and all connected clients show the same result with the roller's name."
- **Spec:** Assumptions: "A joining client gets current data from an online GM client, otherwise from the last snapshot."
- **Spine:** AD-5: "`commit`, `state`, `reset` and `reject` count only from role `GM`, and `propose` only from a known player. Anything else is dropped."
- **Spine:** AD-12 lists seven types, and these include `state-request` and `roll`.
- **Effect:** Read literally, AD-5 drops every roll and every catch-up request. AD-5 binds CAP-6, so this is an omission and not an intent. One builder follows the text and another builder fills the gap.
- **Related:** AD-5 says `replica` does this check "once, before dispatch". It does not name the channel. Commands on `app.muster-roll/ui` come from the client itself. The Owlbear docs say `getPlayers` returns "the other players", so the client's own connection id is not in the list. A check applied to that channel drops every window command.
- **Fix:** Add `state-request` and `roll` from any known player. Limit the check to channel `app.muster-roll/sync`.

### C-2. AD-2 binds values to preset rows, and the spec binds them to field ids [High]

- **Spec:** Constraints: "Values are stored apart from the template, by field id."
- **Spec:** `preset-format.md`: a `field` holds "One value per id". "Rename a field (same id) | Keeps its values".
- **Spec:** CAP-8: "When an upload removes fields that hold values, one confirmation for the whole upload warns that the data will be lost". "Any other upload shows a short notice that the format changed."
- **Spine:** AD-2: `row:{sheetId}:{rowId}` holds "`{ fieldId: value }` for all fields of one preset row".
- **Spine:** AD-14 covers "removed field ids" only.
- **Effect:** The GM moves `str` to another row, or splits one row in two. The field id stays, so nothing is removed and AD-14 does nothing. The GM sees only the short notice. The value stays under the old `rowId`, and the new row renders empty. This is silent data loss, and CAP-8 exists to prevent that.
- **Same defect on import:** CAP-13 drops only "field ids not in the current preset". A field id that exists at another row must keep its value. AD-2 gives no way to do this.
- **Open case:** The same id in two rows of one non-repeat section is one value under the spec and two values under AD-2.
- **Note:** A row as the sync unit is valid. The spec says "a version per row". The defect is the missing rehome rule.
- **Fix:** Add to AD-14 and to the import: a value follows its field id. An upload moves values to the row that now holds the field, in the same batch. Define `row:` for a removed row with no surviving fields.

### C-3. "Client-generated nanoids" conflicts with presets written by hand [High]

- **Spec:** `preset-format.md`: "The GM downloads the JSON file, edits it and uploads it."
- **Spec:** `stack.md`: "Presets are hand-edited shared files".
- **Spec:** CAP-6 uses field ids `str` and `str_tired`.
- **Spec:** `preset-format.md`: "Architecture decides all other JSON keys."
- **Spine:** AD-2: "Preset rows and sections carry stable ids. Ids are client-generated nanoids."
- **Spine:** Deferred: "Preset JSON keys beyond those in `preset-format.md`" go to `core/preset`.
- **Effect, three readings:**
  - A builder applies "nanoids" to field ids too. Formulas then cannot use `str`.
  - A builder generates row ids on upload when they are missing. A hand-written file with no ids then gets new ids on every upload, and every value is orphaned.
  - A builder requires ids in the file. Each author of a second system must invent them, and CAP-4 becomes harder to meet.
- **Why Deferred does not cover this:** The row and section id is a persistence key in AD-2. It is not a private detail of one schema. CAP-12 also moves the file between rooms.
- **Fix:** State that the sentence covers `sheetId`, `instanceId` and generated ids only. State who assigns row and section ids, whether the file must carry them, and what an upload does when they are missing. C-2's rehome rule reduces the damage of a changed id.

### C-4. AD-7 can end catch-up on an empty or stale answer [High]

- **Spec:** Assumptions: "A joining client gets current data from an online GM client, otherwise from the last snapshot."
- **Spec:** CAP-13: "Import replaces all room data after confirmation."
- **Spine:** AD-7: "Each GM client answers with its full replica." "The state ends at the first `last`, or on timeout with no answer."
- **Spine:** AD-9: on a higher generation a client "drops its pending queue and its local copy, then runs catch-up."
- **Effect:** After a `reset`, GM tabs B and C both drop their data and both send `state-request`. AD-7 does not stop a client in `catching-up` from answering. C answers B with an empty replica and `last`. B leaves `catching-up` with no data, and then edits and validates on it. This is the failure AD-7 says it prevents. The answer from the importing GM merges later, but the guard is already gone.
- **Same effect without an import:** A new GM tab with no local copy, or a tab that has just woken, answers first with little or old data.
- **Fix:** A client in `catching-up` does not answer `state-request`. Decide whether "first `last`" is still enough once only caught-up clients answer.

### C-5. AD-6 has no signal in a quiet room [High]

- **Spec:** CAP-15: "With no GM client responding, the player sees a "no connection to GM" status and the edit does not apply. When a GM client responds, the edit is sent again, confirmed and applied."
- **Spine:** AD-6: "It is `online` when a GM-origin message arrived within the timeout, otherwise `offline`."
- **Spine:** AD-12 fixes the types. None is a ping. AD-7 sends `state-request` only "On start and when a page becomes visible".
- **Effect:** A GM is present and nobody edits for some minutes. No GM-origin message arrives, and every player sees "no connection to GM". Builders then choose differently:
  - a GM heartbeat, which needs a new `t` and depends on timers in a hidden tab;
  - a player probe with `state-request`, which makes each GM client resend its full replica;
  - status computed only while a proposal is pending.
- **Fix:** Name the signal. A small `ping` and `pong` in AD-12, sent by the player, avoids GM timers. Or state that `gmLink` is evaluated only while a proposal is pending, and that it shows nothing otherwise.

### C-6. One `preset` record under 15000 bytes caps CAP-4 [Medium]

- **Spec:** CAP-4: "A JSON preset defines the character sheets and the shorter NPC sheets for any game system". The spec gives no preset size limit.
- **Spine:** AD-2 makes `preset` one record, and "The whole value of a record is replaced on merge."
- **Spine:** AD-12: "A record that cannot fit one message is refused at input, with an error to the user."
- **Evidence:** A synthetic full sheet was built for this review. It has 222 cells, 21-character row ids and an assumed key layout. It is 13720 bytes with English labels and 15095 bytes with Russian labels, as compact JSON and before the envelope. This is an estimate, but it shows the limit is reachable with a normal sheet.
- **Fix:** Split the preset into records per template or section, or compress the record value, or chunk it. Or accept the cap and record it in the spec as a limit.

## Part 2: Load-bearing requirements with no carrier

### G-1. No AD carries the CAP-13 import rules [High]

- **Spec:** CAP-13: "Import replaces all room data after confirmation. Values of field ids not in the current preset are dropped, and the GM sees their count. Import restores a token link where the token exists. Import resets player links and write rights to read."
- **Spec:** `storage-and-sync.md`: the Room snapshot file holds "Values and token links".
- **Spine:** AD-9: "Import creates `n + 1`, builds records anew at `c: 1` and broadcasts `reset`." That is the only text on the content of an import.
- **Incompatible readings:**
  - **Write rights.** `core/snapshot` is one codec, and the word "snapshot" covers both the metadata copy and the file. The metadata copy must hold `acl:` and `plink:` (see G-4). If the same codec writes the file, a builder who "builds records anew" restores the rights. A file from another room can then grant write access to old player ids.
  - **Unknown field ids.** AD-14 says `core/preset` "ignores any field id absent from the current preset". A builder can rely on this and keep the values. The count is then never computed, the values use snapshot space, and they return if a later preset adds the id.
  - **The preset itself.** The file holds no preset, and the spec filters against "the current preset". "Replaces all room data" and "builds records anew" do not say that the `preset` record moves to generation `n + 1`. A builder who clears everything leaves the room with no preset.
  - **Old versions.** The rule `c: 1` is clear. It does not say that the file carries no `c`, `a` or generation that a reader may trust.
- **Fix:** One rule in AD-9, owned by one `core/snapshot` function: file in, current preset in, out come records and a dropped count. The output has no `acl:` or `plink:`, keeps `link:` only for tokens that exist, and carries the current `preset`. No write happens before the confirmation.

### G-2. The port list cannot serve token checks or the client's own identity [Medium]

- **Spec:** CAP-13: "Import restores a token link where the token exists."
- **Spec:** CAP-14: "A user can open a linked sheet from its token."
- **Spine:** Layer table: "Ports for broadcast, metadata, party and storage."
- **Spine:** AD-16: "Only `src/platform/obr` imports `@owlbear-rodeo/sdk`."
- **Effect:**
  - No port reads scene items or adds the token menu, so builders will add incompatible ones or break AD-16.
  - Tokens belong to a scene, but `link:{tokenId}` is a room record. If another scene is open at import, every token looks absent, and the links are lost for good. Neither document says what "exists" means.
  - The Owlbear docs say `getPlayers` returns "the other players". A client's own role and player id need another port. Role decides who writes and who proposes.
- **Fix:** Add scene-items, player and context-menu ports. Decide the rule for a token in a scene that is not open. This second part is also a question for the spec.

### G-3. One upload confirmation has no owner [Medium]

- **Spec:** CAP-8: "When an upload removes fields that hold values, one confirmation for the whole upload warns that the data will be lost, and the values are then erased on all sheets. Any other upload shows a short notice that the format changed."
- **Spine:** AD-14 starts at "An upload writes the `preset` record". The Capability Map gives CAP-8 to `core/preset, replica`.
- **Incompatible readings:**
  - The window computes the diff on its projection, and `replica` computes it again or not at all.
  - "Holds a value" is undefined. The spec says an unchecked check "counts as 0 and is not an empty field". A check at `false`, an empty string, and a `repeat` section that has rows are all open.
  - Upload during `catching-up` is not covered. AD-7 forbids "edits". A preset upload is not named. The diff on a stale copy misses values.
- **Fix:** One `core/preset` diff over the full replica returns the removed ids that hold values. `replica` writes only after the confirmation, and refuses in `catching-up`.

### G-4. The GM's move to another device depends on snapshot content that nothing fixes [Medium]

- **Spec:** `storage-and-sync.md`: "If the snapshot does not fit, the GM sees a notice and play continues by broadcast. Two things are lost: reading with no GM online, and moving to another GM device."
- **Spec:** Constraints: "Room metadata holds only a compressed snapshot, and only when it fits."
- **Spine:** AD-7 merges the snapshot on start, and AD-8 writes it. AD-8 says only that it "encodes with `core/snapshot`". Deferred moves "Snapshot byte layout" to one codec.
- **Why this is more than byte layout:** The move works only if the snapshot holds every key form with `c` and `a`: `preset`, `sheet:`, `row:`, `rep:`, `acl:`, `link:`, `plink:`, and the tombstones.
  - A builder who saves space by leaving out tombstones or versions brings deleted records back through a stale tab.
  - A builder who treats the metadata snapshot like the export file ("Values and token links") loses write rights on the new device. The spec resets them only on import.
- **Not stated:**
  - Compression. AD-8 does not say the snapshot is compressed. It appears only in the stack table.
  - The old snapshot after a skip. The spec says reading and the device move "are lost". AD-8 leaves the earlier snapshot in place, so a player or a new device reads old data as current. Keep or delete is open.
  - The start state of a new device with no snapshot. It looks the same as a new room.
- **Fix:** One sentence in AD-8: the snapshot is all records of the replica, tombstones and versions included, plus the generation, compressed. Add a rule for the old snapshot after a skip.

### G-5. The AD-8 read-back gives false alarms with two GM clients [Medium]

- **Spec:** CAP-9: "The snapshot is written when it fits. When it does not fit, it is skipped and the GM sees a notice."
- **Spine:** AD-8: "Any GM client writes after a pause in edits". "Otherwise it writes, reads back and compares. A mismatch raises the same notice."
- **Effect:** All GM clients see the same edit, so their pause timers end at about the same time. Tab A writes, tab B writes, and A reads B's bytes. If encoding is not canonical, the record order follows arrival order and the bytes differ. A then shows a "does not fit" notice with plenty of free space. "Compares" is also undefined: it can be byte equality or a merge check.
- **Evidence:** The probe compared by exact string with one writer. It gives no evidence for two writers.
- **Fix:** The compare passes when the snapshot read back holds every local record at an equal or higher version. Or require canonical encoding and retry on a mismatch.
- **The size check itself lands.** AD-8 measures all room metadata, with its own key replaced, in UTF-8 JSON. The limit of 15500 is below the measured 16000 and 16050. The 500-byte margin and the read-back cover another extension that writes in between.

### G-6. Generation has no start value, no lookup and no write trigger [Medium]

- **Spec:** CAP-13 replace semantics. CAP-9: "When it does not fit, it is skipped".
- **Spine:** AD-9: "A room has a generation `{ n, a }`". AD-11: keys are `mr:{roomId}:{n}:{a}:{k}`. AD-8: writes "after a pause in edits and when its page becomes hidden".
- **Not stated:**
  - The first generation of a new room. Two GM tabs in a new room must get the same value. "Generation changes only on import" means it cannot be generated per client.
  - How a client picks its generation on start, when `localStorage` holds keys and the snapshot may be older, newer or absent.
  - A snapshot write right after import. An import is not an edit pause. If the importing GM closes the tab, the clients that dropped their copy have nothing.
  - Import where the new snapshot does not fit. The old snapshot stays at generation `n`, and players keep reading replaced data, with the old write rights in it.
- **Fix:** A constant start value. A start rule: the highest generation among local keys and snapshot. A snapshot write at once after import.

### G-7. The `app.muster-roll/ui` channel has no size rule [Medium]

- **Spec:** Constraints: "Broadcast messages are limited to 16KB."
- **Spine:** AD-10: windows "send commands by broadcast with destination `LOCAL`". AD-12 applies the 15000 limit to "All room traffic" and to "Record batches".
- **Effect:** The file picker is in a window, and `replica` owns the data. A room snapshot file is uncompressed JSON and can pass 16KB. The projection from `replica` to a window can too. The Owlbear docs give the limit on `data` as "Limited to 16KB in size" and do not exempt `LOCAL`. Whether `LOCAL` enforces it was not tested.
- **Fix:** Test `LOCAL` in the probe. Then either use the AD-12 split function on the UI channel, or define a path that does not use broadcast.

### G-8. Version handling covers messages only [Medium]

- **Spine:** AD-12: "A message with a higher `v` is dropped, and the UI asks for a reload."
- **Spine:** Structural Seed: "Clients on different builds can meet in one room, and AD-12 covers that."
- **Spine:** Deferred: the snapshot layout will "change with `v`".
- **Spec:** Success signal: "One real session runs with the party and NPCs kept only in the extension, and no data is lost."
- **Effect:** An old-build GM reads a snapshot that a new build wrote. The parse fails. One builder treats that as "no snapshot" and writes over it, so AD-8's read-merge-write destroys newer data. Malformed snapshots and export files with a higher `v` have the same gap.
- **Fix:** A snapshot that does not parse, or has a higher `v`, blocks the write and raises a notice. A file with a higher `v` is refused.

### G-9. The `roll` message lacks what CAP-6 shows [Medium]

- **Spec:** CAP-6: "with the roller's name". "A roll from an NPC sheet shows only on GM clients."
- **Spine:** AD-13: "broadcasts one `roll` with a result and a roll id." "A roll from an `npc` sheet is shown only on GM clients."
- **Effect:** A receiver needs the name and the sheet kind. A name can come from the payload or from the party list, and these differ after a rename. The kind can come from the payload or from a replica lookup, and a player may not have the record yet. An NPC roll that lacks the kind shows to everyone.
- **Fix:** State the payload: result, roll id, sheet id, kind, name, and which source wins.

### G-10. Input during `catching-up` is undefined [Low]

- **Spine:** AD-7: "While `catching-up`, a client neither creates edits nor validates proposals." It enters this state "when a page becomes visible", which is every tab switch.
- **Spec:** Success signal: "no data is lost."
- **Effect:** A field blurs during the window. One builder drops the edit, another queues it. Decide: disable input, or queue and create the edit at exit.

### G-11. CAP-12 preset import has no route [Low]

- **Spec:** CAP-12: "The GM can export and import the preset as a JSON file."
- **Spine:** The Capability Map gives CAP-12 only AD-12. AD-14 says "upload". AD-9 says "Generation changes only on import."
- **Effect:** A preset import into a room with sheets could follow AD-9 and replace data, or follow AD-14. The spec intends CAP-8 behavior.
- **Fix:** Map CAP-12 to AD-14. In AD-9 write "snapshot import".

### G-12. Smaller items [Low]

- **Deleting a sheet.** AD-2 has tombstones, but no rule says if `row:`, `rep:`, `acl:`, `link:` and `plink:` go with the sheet. Orphans use snapshot space. No CAP covers sheet creation or deletion.
- **Player link.** The spec names "player links" only in CAP-13, and no capability reads them. AD-2 fixes one sheet per player. The spec says "Hirelings and pets are characters", so a player can hold several. This is a question for the spec.
- **Pending edits on reset.** AD-9 drops the pending queue with no message to the player. CAP-15 says nothing on this case.
- **Capacity.** The spec says "measure again on the real format". The spine memlog has one figure, 8604 bytes for 6 PC + 60 NPC. No preset, Russian text, `acl:` records or tombstones are in the spec's estimate. Tombstones stay until the generation changes. Measure before the first real session.
- **Traceability.** The Capability Map and the AD `Binds` lines differ:
  - AD-12 does not bind CAP-12, but the map lists it.
  - AD-8 binds CAP-13, and the map does not list it.
  - AD-7 binds CAP-9, and the map does not list it.
  - Frontmatter `sources` lists only `SPEC.md`, and `companions` is empty, but the spine depends on the three companion files.

## Checked, no finding

- **Non-goals:** no server, D1 or KV. No editor in the extension. No per-edit approval. No merge of an imported snapshot (AD-9). No protection from modified clients (Deferred). No merge of two edits of one row (AD-2).
- **Hidden tab.** The spec says "a hidden tab does not count as online". AD-6 counts any client that responds. A frozen tab does not respond, and CAP-15 is written in terms of response. The effect is the same.
- **Timers:** the Time convention and AD-8 follow "Do not depend on timers in a hidden GM tab."
- **Rights:** a right binds to the player id through the party list (AD-4, AD-5).
- **NPC hiding:** interface only (AD-15), as the spec accepts.
- **Formulas:** no `eval`. CAP-7 sends no message on failure (AD-13).
- **Storage:** one localStorage key per record, and a GM-only local copy, match "Full data lives in the GM's browser."
- **Read-back.** The probe proved that reading metadata back detects a dropped write, with one writer.
- **Stack:** the table matches `stack.md`. `react-aria-components` fits the spec's "react-aria".

## Sources outside the spec package

- Owlbear docs, read 2026-11-10: `docs.owlbear.rodeo/extensions/apis/broadcast/` and `docs.owlbear.rodeo/extensions/apis/party/`.
- `prototypes/owlbear-probe` SDK 3.1.0 types and bundle.
- `TASK-1` and the two `.memlog.md` files.
