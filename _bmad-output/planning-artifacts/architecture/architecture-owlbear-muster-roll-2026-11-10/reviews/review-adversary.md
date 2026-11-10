# Adversary review — Muster Roll architecture spine

Reviewed: `ARCHITECTURE-SPINE.md` (draft, 2026-11-10), against `SPEC.md`, `storage-and-sync.md` and `preset-format.md`.

## Verdict

**Do not build on this spine yet. Tighten it first.**

The merge function is sound for records with different versions. The defects are at the edges of merge: how a version is minted, when a client counts as caught up, and which contracts have no owner. Findings 1 to 4 occur in an ordinary session. All 24 tightenings are small. None changes the paradigm, and none needs a leader or a server.

## Method and limits

- I wrote a literal model of the AD-3 merge and the AD-4 proposal rule. It confirms the replica split and the lost edit in finding 1, and both outcomes of finding 8.
- I read the types of `@owlbear-rodeo/sdk` 3.1.0. `sendMessage` accepts only `REMOTE`, `LOCAL` or `ALL`, so no message goes to one connection. The event carries `{ data, connectionId }`.
- I read the probe build in `prototypes/owlbear-probe/dist`. Its metadata read-back waits 1500 ms after the write.
- The Owlbear docs refused automated access (HTTP 403). Three facts stay unverified: any broadcast rate limit, whether the 16KB limit applies to `LOCAL`, and whether `getPlayers()` omits the calling connection.
- Size figures are my estimates on an assumed format: 6 PC + 60 NPC gives 372 records and 64609 bytes of JSON, which is 5 messages per answering GM client. A preset of 62 rows with Cyrillic labels gives 19689 bytes.
- The probe saw a frozen tab resume only when the GM returned, and that is one observation. This review takes the wider premise of its brief: a resume can occur with no page restart, and possibly with the tab still hidden. Findings 4 and 10 say where this matters.

Modified clients are out of scope, so no finding depends on one.

## Ranked findings

Rank is the likelihood of a visible defect in a real session of 1 GM, 4 to 6 players and 3 to 4 hours. For a clash between units, rank includes the chance that it survives first integration.

| # | Hole | Kind | ADs | When it occurs |
| --- | --- | --- | --- | --- |
| 1 | Two fast edits of one row share a version | Lost edit, no convergence | 2, 3, 4 | Every session with player write access |
| 2 | An idle GM looks offline, and no probe message exists | Clash, false status | 6, 12 | Every quiet stretch |
| 3 | Catch-up ends on another client's `last` or on an empty answer | Clash, stale gate | 7, 12 | Session start, tab returns, every import with 2 GM clients |
| 4 | A missed `commit` is never repaired | No convergence | 5, 7 | Laptop sleep, network drop |
| 5 | An edit made during catch-up has no rule | Clash, lost edit | 7 | Every tab return with fast typing |
| 6 | The `ui` channel has no contract | Clash, lost edit | 2, 10, 12 | First build, then latent |
| 7 | Two GM clients raise a false "does not fit" notice | False alarm, blind check | 8 | Every edit pause with 2 GM clients |
| 8 | A proposal is confirmed but not applied, or an older one beats a later GM edit | Lost edit | 3, 4 | A GM edits a row that has a pending edit |
| 9 | A re-uploaded preset orphans its row records | Lost data, no warning | 2, 14 | A preset revision |
| 10 | A stale GM client validates, or wrongly rejects | Invalid GM check | 4, 5, 7 | Freeze or sleep with 2 GM clients |
| 11 | A large preset is refused | Blocks CAP-4 | 2, 12 | Preset authoring |
| 12 | Catch-up ignores localStorage | Lost edit on reload | 7, 11 | Tab resume with no other GM |
| 13 | The pending queue has no owner, and an edit has no identity | Clash, stuck edit | 4, 10 | First build, then latent |
| 14 | AD-5 drops `roll` and `state-request` | Clash | 5, 7, 13 | Literal build; found on day one |
| 15 | `roll` has no contract for NPC visibility or evaluation site | Clash, NPC roll shown | 10, 13, 15 | Late joiner during an NPC roll |
| 16 | Field values have no type | Clash, formula errors | 2, 12 | First build, then edge cases |
| 17 | A freeze falls inside the snapshot cycle | Rollback of the snapshot | 8 | Rare |
| 18 | `reset` drops data before the new data arrives | Empty room | 7, 9 | Importer freezes or closes |
| 19 | Sheet delete has no cascade | Orphans | 2 | Delete during a live edit |
| 20 | An old build overwrites a newer snapshot | Rollback of the snapshot | 8, 12 | Deploy during a session |
| 21 | A role change during a session | Stale authority | 1, 5, 11 | GM demotes or promotes |
| 22 | The first generation has no value | Clash, data dropped | 9, 11 | First 2-GM test |
| 23 | localStorage "one synchronous step" is not atomic across tabs | Stale local record | 11 | Sub-second conflict in 2 tabs |
| 24 | A split preset batch is not atomic | Erased values can return | 12, 14 | Uploader closes during the batch |

---

## 1. Two fast edits of one row share a version

**ADs:** AD-2, AD-3, AD-4. **Spec:** CAP-3, CAP-11, CAP-15.

AD-3 mints `c` as "the highest known `c` of that key + 1". AD-4 keeps the player's edit "outside the replica". A record holds the whole preset row (AD-2). So a second edit before the first `commit` reuses the version and is built on the old row.

**Sequence.** `row:s:r` is `{str_tired: false, dex_tired: false}` at `(4, G)`. GM X and GM Y are online.

1. The player ticks `str_tired`. Edit e1 is `v = {str_tired: true, dex_tired: false}`, version `(5, P)`.
2. Before the `commit` of e1 arrives, the player ticks `dex_tired`. The replica still shows `c = 4`. Edit e2 is `v = {str_tired: false, dex_tired: true}`, version `(5, P)`.
3. GM Y leaves `catching-up` between the two sends. It drops the first send of e1 and accepts e2. Then it gets the resend of e1.
4. X merges e1 and then e2. Neither beats the other, so X keeps e1. Y keeps e2.
5. Both broadcast `commit`. Neither `commit` changes the other GM client's record. X and Y hold different values under one version, permanently.

With one GM client the replicas agree, but e2 is lost. The `commit` of `(5, P)` matches both pending entries.

Fixing only the counter does not help. With e2 at `c = 6` and `v` still built from the replica, e2 beats e1 and resets `str_tired`. The model confirms this.

The window is one round trip, which is shorter than two clicks on adjacent checks. It is also any period in which no GM client answers, which CAP-15 expects.

**Tightening (AD-4).** "A player holds at most one pending entry per key. A new edit to that key updates the entry: `v` is the entry's value with the new field applied, and `c` is the entry's `c` + 1. Only the newest entry is resent." **(AD-3).** "One connection never emits one `(k, c, a)` with two different values."

## 2. An idle GM looks offline, and no probe message exists

**ADs:** AD-6, AD-12. **Spec:** CAP-15.

AD-6 sets `online` when "a GM-origin message arrived within the timeout". The closed `t` list in AD-12 has no message that a GM client sends with nothing to report.

**Sequence.** The GM describes a scene for longer than the timeout. Nobody edits and nobody rolls. No GM-origin message exists, so every player shows "no connection to GM" while the GM is online. An edit or a roll by the GM clears it, and then it returns.

**Two conflicting units.**

- `gmLink` unit A probes with `state-request`, the only request in the list. Every GM client then broadcasts its full replica to the whole room, about 5 messages each, per probe.
- `gmLink` unit B adds `t: "ping"`. Every client on unit A's build fails the zod parse and drops it.

Spec note: the spec says "a hidden tab does not count as online". AD-6 counts any response. A live hidden tab can answer for 13 minutes, so the two differ. A response-based rule meets the reason the spec gives, because a frozen tab cannot respond. The wording needs one decision.

**Tightening (AD-12, AD-6).** "Add `ping` and `alive`. A client with no GM-origin message for half the timeout sends `ping`. A GM client that is not `catching-up` answers `alive` on receipt, with no timer." Finding 4 reuses `alive`.

## 3. Catch-up ends on another client's `last` or on an empty answer

**ADs:** AD-7, AD-12. **Spec:** CAP-10, CAP-11.

No message goes to one connection, so every `state` answer reaches the whole room. `state` has no link to its request, and AD-7 does not stop a client in `catching-up` from answering. "The state ends at the first `last`."

**Sequence A, the tail of another answer.**

1. Client C1 sends `state-request`. GM A starts a train of 5 `state` messages.
2. Client C2 becomes visible during the train and enters `catching-up`.
3. C2 merges the last 2 messages and sees `last`. It leaves `catching-up` with 2/5 of the room.
4. C2 now mints low counters (finding 8), and if C2 is a GM client it validates against a partial `acl` set.

**Sequence B, after every import with 2 GM clients.**

1. GM A imports and broadcasts `reset`.
2. GM B and player P drop their copies and both send `state-request`.
3. B, empty, answers P with zero records and `last`.
4. P leaves `catching-up` with an empty room.

**Two conflicting units.** Both obey "the state ends at the first `last`".

- Catch-up unit A ignores `state` outside `catching-up`. After sequence B, P stays empty until its next tab return.
- Catch-up unit B merges every `state`. P recovers when A's train arrives.

**Tightening (AD-7).** "`state-request` carries a nonce `r`, and `state` echoes it. A client leaves `catching-up` only on `last` with its own `r`. A client in `catching-up` does not answer. `state` merges whenever it arrives, in any client state."

## 4. A missed commit is never repaired

**ADs:** AD-5, AD-7. **Spec:** CAP-11.

A GM `commit` is not resent, and only a proposal has a resend loop. Catch-up runs only "on start and when a page becomes visible". Any missed `commit` stays missing while the page stays visible.

**Sequence A, sleep or network.**

1. A player closes a laptop at the break. Depending on the platform, `visibilityState` may stay `visible` through sleep, so no event fires. A Wi-Fi drop has the same effect with the page plainly visible.
2. GM clients commit edits to `row:s:r`, now at `c = 9`.
3. The player's client reconnects. Its replica stays at `c = 5` with no error.
4. The player edits the row at `c = 6`. A GM client merges it, it loses, and `commit` clears it (finding 8). The edit is gone.

**Sequence B, party list lag.** A new GM connection sends `commit` before its party entry reaches a receiver. AD-5 re-reads once, and that read can return the same list. The `commit` is dropped for good.

**Tightening (AD-7, AD-12).** "`alive` carries a digest: the XOR of a hash of `(k, c, a)` over all records. A client that sees a differing digest in two consecutive `alive` messages from one GM client enters `catching-up`. So does a client on the browser `online` event or a Page Lifecycle `resume`." This does not depend on hidden-tab timers.

## 5. An edit made during catch-up has no rule

**AD:** AD-7. **Spec:** CAP-1, CAP-11.

AD-7 says a client in `catching-up` "neither creates edits nor validates". It does not say what happens to the edit a person makes then.

**Sequence.** A solo GM returns from a rulebook tab, which enters `catching-up`. No other GM client answers, so the state lasts the whole timeout. The GM types a number and presses Tab inside that window.

**Two conflicting units.**

- UI unit A disables inputs while `catching-up`. The field drops focus on every tab return.
- Replica unit B accepts the command and discards it. The value shows and then vanishes.

**Tightening (AD-7).** "An edit made during `catching-up` waits in the same pending queue. It takes `c` when `catching-up` ends. A GM client then merges it at once. Inputs stay enabled."

## 6. The `ui` channel has no contract

**ADs:** AD-2, AD-10, AD-12. **Spec:** CAP-1.

AD-12 governs "all room traffic". AD-10 sends commands on `app.muster-roll/ui` and says only that windows "render a projection". There is no schema, no way for a window to get its first projection, and no owner for composing `v` or minting `c`.

**Two conflicting units.** Both obey every AD.

| | Sheet window unit | Engine unit |
| --- | --- | --- |
| Edit command | `{ k, v }`, the whole row from its projection | `{ sheetId, rowId, fieldId, value }` |
| `c` minted by | The window, through `core`, from its projection | The engine |
| Projection | Expects an initial full push when it opens | Pushes only deltas after a change |

**Hidden loss, if the first column wins.** A GM edits `str` and tabs to `dex` in one row. The second command is composed before the projection updates, so it sends the old `str`, and the first edit is undone. The GM's own two sequential edits are not "simultaneous", so the spec does not allow this.

A snapshot import is also a command. Its file can exceed 16KB, and whether `LOCAL` has that limit is unverified.

**Tightening (AD-10).** "`core` owns a zod schema for `ui`. An edit command is a field patch. Only `replica` composes `v` and mints `c`. A window opens by sending `projection-request`. Commands and projections use the AD-12 split function."

## 7. Two GM clients raise a false "does not fit" notice

**AD:** AD-8. **Spec:** CAP-9.

AD-8 compares the read-back with what the client wrote. Any other writer makes that comparison fail, and "a mismatch raises the same notice".

**Sequence.**

1. Two GM tabs get the same last `commit`, so their "pause in edits" timers end at nearly the same moment.
2. A writes, then B writes.
3. A reads back B's bytes. The key order depends on each replica's insertion history, so the bytes differ even when the data is equal.
4. A tells the GM that the snapshot does not fit, and it does.

**Blind spot.** The probe read back 1500 ms after the write and saw the drop. AD-8 names no delay. Whether an immediate read on the writer shows the dropped value is not measured, so an immediate check can pass while the data is gone. A delay long enough to be safe widens the race above.

**Tightening (AD-8).** "Read back after a settle delay, starting at the probe's 1500 ms. The check passes when, after decoding, every written record's version is at or below the version read back. A higher generation in the read-back also passes." `core/snapshot` sorts by key, so that equal data gives equal bytes.

## 8. A proposal is confirmed but not applied, or an older one beats a later GM edit

**ADs:** AD-3, AD-4. **Spec:** CAP-15, storage-and-sync "latest version wins".

A pending edit keeps the `c` from when it was made, and the GM must merge it "unchanged". Time can pass before a GM client answers. The model confirms both outcomes below.

**Sequence.** `row:s:r` is at `(4, G)`.

1. All GM clients are away. A player sets `str`. The proposal is `(5, P)`, the whole row.
2. The GM returns, catches up and edits `dex` in that row: `(5, GM)`. This is later in real time.
3. The player's resend arrives.

- If `GM > P` as strings, the proposal loses. AD-4 still broadcasts `commit`, so the player clears the entry. The edit is "confirmed" and not applied, with no `reject`. This violates CAP-15.
- If `P > GM`, the older whole-row proposal wins and the GM's later `dex` is gone. The outcome depends on two connection id strings.

**Sub-clash.** A GM unit that sends the proposal in `commit` and one that sends the winning record both obey AD-4. With the second, `(k, c, a)` never matches and the player resends for ever.

**Tightening (AD-4).** "A proposal passes only if its `c` is above the current `c` of the key, or it is identical to the current record. Otherwise the GM client answers `reject` with reason `stale` and the current record. The player applies its field patch to that record, takes `c` + 1 and proposes again. `commit` always echoes the proposal's `(k, c, a)`."

## 9. A re-uploaded preset orphans its row records

**ADs:** AD-2, AD-14. **Spec:** CAP-8.

AD-2 says "preset rows and sections carry stable ids", and "ids are client-generated nanoids". `preset-format.md` gives a stable id only to a field. AD-14 strips only *removed* field ids. So values key on a row id that the file may not hold.

**Sequence A, no ids in the file.** The GM writes a preset by hand and uploads it, and the client mints row ids. Later the GM edits the same local file and uploads it again. The client mints new ids. Every `row:` key is now orphaned, and every sheet is empty. No field was removed, so no confirmation appears.

**Sequence B, a field moves.** The GM moves `dex` from row R1 to row R2. It is not removed, so AD-14 strips nothing. The value stays in `row:s:R1` and the view reads `row:s:R2`. The value disappears with no warning.

**Tightening (AD-14, AD-2).** "Row and section ids are required in the preset file, and an upload without them is refused. The upload batch also moves the value of a field that changed rows, and tombstones the record of a row that no longer exists. Values that would be lost count toward the one confirmation."

## 10. A stale GM client validates, or wrongly rejects

**ADs:** AD-4, AD-5, AD-7. **Spec:** CAP-3, and the constraint that a GM client checks the write right.

This is the path to a player edit with no valid GM check. The check runs on an old `acl`. AD-7 opens the `catching-up` gate only on start or visibility. AD-5 accepts a `commit` by the sender's role alone, so a fresh GM client merges the result of a stale check.

**Sequence, an invalid accept.**

1. GM tab A is hidden and frozen. It holds `acl:s:P = true` at `c = 2`.
2. GM tab B returns and enters `catching-up`. Player P edits sheet `s`. Nobody answers, so the proposal is pending.
3. B finishes and revokes P: `acl:s:P = null` at `c = 3`. B receives the resend and sends `reject`.
4. A resumes while hidden, or on a laptop wake. No visibility event fires, so it is not `catching-up`.
5. A receives the resend, passes it against `c = 2`, merges and broadcasts `commit`.
6. B and all clients merge it. AD-5 checks only that A is a GM. The edit applies after a revoke, which violates CAP-3.

**Sequence, a false reject.** Tab B grants P access and then freezes. Stale tab A resumes and is the only client answering. It rejects P's valid edit. `reject` is final, so the edit is lost.

The resume case rests on a resume with the tab still hidden, or on sleep. If a tab resumes only on return, the remaining risk is the order of queued messages against the `visibilitychange` handler. The closure is the same.

**Tightening (AD-7, AD-4).** "A client also enters `catching-up` on Page Lifecycle `resume` and on a digest mismatch (finding 4). A GM client validates only if it has left `catching-up` since its last resume." A proposal that crosses a revoke in flight stays as an accepted race. State that in AD-4.

## 11. A large preset is refused

**ADs:** AD-2, AD-12. **Spec:** CAP-4.

The `preset` key is one record, and "a record that cannot fit one message is refused at input". My estimated preset of 62 rows with Cyrillic labels is 19689 bytes against the 15000 limit. A full game system is rejected with no way forward.

**Tightening (AD-2).** "The `preset` value is stored and sent deflated, and the 15000-byte check applies to the deflated form." `fflate` is already in the stack.

## 12. Catch-up ignores localStorage

**ADs:** AD-7, AD-11. **Spec:** CAP-1, CAP-9.

AD-7's sources are the snapshot and `state`. AD-11 writes localStorage and never says when it is read. A literal build reads nothing back, so reload loses data whenever no peer answers and the snapshot was skipped.

**Sequence (two tabs of one browser).**

1. Tab 2 is frozen with a row at `c = 5`.
2. Tab 1 edits it to `c = 9`, writes localStorage, and closes before its snapshot lands.
3. Tab 2 returns. No peer answers, and the snapshot is old. Catch-up ends on timeout, still at `c = 5`.
4. The GM edits the row: `(6, tab2)`. AD-11 reads key `c = 9`, merges and keeps `c = 9`.
5. Tab 2 shows the new value. After a reload the old value returns. This violates CAP-1.

**Tightening (AD-7).** "A GM client merges all `mr:` records of the current generation before it sends `state-request`, on start and on each resume."

## 13. The pending queue has no owner, and an edit has no identity

**ADs:** AD-4, AD-10. **Spec:** CAP-15.

The queue is "outside the replica", so AD-10 does not assign it.

**Two conflicting units.**

- `ui/pending` holds the queue in a nanostore because "the UI shows it". A closed window ends the resends.
- `replica/pending` holds the queue in the background page and keeps resending. Both obey AD-4 and AD-10.

Identity is also unnamed: `(k, c, a)` is the implied choice, and a unit that clears by key alone removes a newer entry on an older `commit`.

**Tightening (AD-4).** "`src/replica` owns the pending queue and exposes it through the projection. An edit is identified by `(k, c, a)`."

## 14. AD-5 drops `roll` and `state-request`

**ADs:** AD-5, AD-7, AD-13.

AD-5 admits `commit`, `state`, `reset`, `reject` from a GM and `propose` from a known player. Then "anything else is dropped". `roll` and `state-request` are in neither list, so a literal dispatcher kills both, and AD-7 and AD-13 stop working. The first integration test will find this.

**Tightening (AD-5).** "`roll` and `state-request` count from any known player."

## 15. `roll` has no contract for NPC visibility or evaluation site

**ADs:** AD-10, AD-13, AD-15. **Spec:** CAP-6.

**Two conflicting units.**

- Receiver unit A looks up the sheet kind in its replica. A client that joined a moment ago has no such sheet. Unit A defaults to showing, so a player sees an NPC roll.
- Window unit B evaluates the formula, because the UI may import `core`. Engine unit C expects a request to evaluate. Both meet "the roller's client evaluates".

If a unit sends with `ALL` to reach its own windows, its own connection may fail the AD-5 lookup (unverified).

**Tightening (AD-13).** "`replica` evaluates on a window command. `roll` carries the sheet `kind`, and an unknown kind is hidden from players. Own windows get the result through the projection."

## 16. Field values have no type

**ADs:** AD-2, AD-12. **Spec:** CAP-7.

`{ fieldId: value }` does not fix the types. A UI unit stores `"12"` from an input and `""` for empty. A formula unit expects a number and reads a missing key as empty. A `check` can be a boolean or 0/1.

**Tightening (AD-2).** "`number` is a JSON number, `text` is a string, `check` is a boolean, and empty means the key is absent."

## 17. A freeze falls inside the snapshot cycle

**AD:** AD-8. **Spec:** CAP-9.

**Sequence.** A hidden tab's late pause timer starts a cycle and reads the snapshot. The tab freezes for 27 minutes. Another GM client writes newer data. The tab resumes and writes its older merge. The read-back matches, so the room's shared copy has moved backward. The next write by a current GM client repairs it, but only if one happens before all GM clients leave.

**Tightening (AD-8).** "Abandon a write cycle if a `resume` or a visibility change fell between its read and its write."

## 18. `reset` drops data before the new data arrives

**ADs:** AD-7, AD-9. **Spec:** CAP-13.

AD-9 drops the local copy and then runs catch-up. If the importer freezes or closes first and the snapshot did not fit, every other client is empty. The data exists only in the importer's browser.

**Tightening (AD-9).** "Keep the old copy until the new generation's first complete catch-up. Messages of the old generation stay ignored."

## 19. Sheet delete has no cascade

**AD:** AD-2.

One unit tombstones only `sheet:`. Another tombstones all children. A late player proposal also recreates a `row:` under a deleted sheet. Orphans then sit in every snapshot and take space.

**Tightening (AD-2, AD-4).** "A sheet delete tombstones its `row:`, `rep:`, `acl:`, `link:` and `plink:` records in the same batch. `core/access` fails when the sheet is tombstoned."

## 20. An old build overwrites a newer snapshot

**ADs:** AD-8, AD-12.

AD-12 covers a higher `v` only for a message. An old tab that cannot read a higher-`v` snapshot treats it as absent, and AD-8 then writes the old format over it. Handling of a lower `v` is not stated either.

**Tightening (AD-12).** "A snapshot with a higher `v` is not read and not overwritten. A lower `v` is accepted only through `core` migration."

## 21. A role change during a session

**ADs:** AD-1, AD-5, AD-11.

A unit that reads the role once at start keeps validating after a demotion. Peers drop its messages by AD-5, so its replica splits from theirs without an error. A promoted client has no persisted data.

**Tightening (AD-5).** "`replica` reads its own role from each `party` change, and a change enters `catching-up`."

## 22. The first generation has no value

**ADs:** AD-9, AD-11.

If a unit starts with `{ n: 0, a: <own connection id> }`, as it would for a record, two GM clients hold different generations. One treats the other as higher and drops its copy.

**Tightening (AD-9).** "Before the first import, the generation is `{ n: 0, a: "" }`."

## 23. localStorage "one synchronous step" is not atomic across tabs

**AD:** AD-11.

As far as I know, Chrome has no cross-process storage lock, so two tabs in separate processes can both read and then write in sequence (not measured). A lower-version record can land last. The loss appears only on reload with no peer. **Tightening:** say in AD-11 that the rule guards against stale tabs and not against this race, or key each tab's writes separately and merge on load.

## 24. A split preset batch is not atomic

**ADs:** AD-12, AD-14. **Spec:** CAP-8.

AD-14 says "in the same batch" and AD-12 splits batches into several messages. If the uploader closes midway, some rows keep the removed field. `core/preset` hides them until the field id returns, and then the erased values return. **Tightening:** state this as an accepted loss in AD-14, or have `core/preset` strip removed ids when any GM client next writes a record.

---

## Attacks that failed

- Equal proposals at two GM clients give one record. `c` and `a` stay unchanged.
- For records with different versions, merge commutes and is idempotent. Duplicates, reordering and full-state resends are safe.
- Clock skew cannot decide a conflict, because no device time enters a version.
- A stale tab cannot overwrite the snapshot outside finding 17, because it merges the current snapshot first.
- The 16KB and metadata limits hold: each `state` message merges alone, and the size check runs before the write.
- A stale generation cannot bring back rows after an import. A lower generation is ignored.

## Smallest set of amendments

Six edits close findings 1 to 5, 7, 8, 10, 12 and 13. The order is the order of value.

1. **AD-4:** one pending entry per key, updated in place, owned by `replica`. A proposal must have `c` above the current `c`, otherwise `reject` with reason `stale`. `commit` echoes `(k, c, a)`.
2. **AD-7:** nonce on `state-request` and `state`. A client in `catching-up` does not answer. `state` always merges. Edits made during catch-up wait in the queue.
3. **AD-12 and AD-6:** add `ping` and `alive`, with a digest in `alive`.
4. **AD-7:** enter `catching-up` on `resume`, on `online` and on a digest mismatch. Merge `mr:` records first.
5. **AD-4:** a GM client validates only if it has left `catching-up` since its last resume.
6. **AD-8:** read back after a settle delay and compare by version dominance.

Findings 6, 9, 11 and 14 to 16 each need one clause in AD-2, AD-5, AD-10, AD-13 or AD-14.
