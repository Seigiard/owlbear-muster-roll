# Rubric review: Muster Roll architecture spine

Reviewed: `ARCHITECTURE-SPINE.md` (status draft, updated 2026-11-10), against `SPEC.md`, `preset-format.md`, `storage-and-sync.md` and `stack.md`.

## Verdict

**Not ready for epics. Revise the spine first.** The paradigm and most ADs are sound. Two rules, implemented as written, break core flows. Five more gaps let epics diverge or lose data. The deployment dimension is almost silent.

| Severity | Count |
| --- | --- |
| Critical | 2 |
| High | 7 |
| Medium | 11 |
| Low | 7 |

## Checklist result

| Check | Result | Findings |
| --- | --- | --- |
| Fixes the real divergence points and misses none | Fail | H3, H4, M6, M7, M8 |
| Every Rule is enforceable and prevents its divergence | Fail | C1, C2, H1, H2, M2, M3, M4 |
| Nothing under Deferred lets two units diverge | Partial fail | H6. See "Deferred items" |
| Covers the spec's capabilities | Partial | See "Capability coverage" |
| Every dimension is decided, deferred or an open question | Fail | H5 |
| Each AD passes the three-part test | 14 of 16 pass | AD-15 and AD-16 fail. See "AD test" |

## Evidence and limits

- `lint_spine.py`: 3 low findings. All are `{n}`, `{a}` and `{k}` in AD-11, which are intended patterns. No mechanical failure remains.
- SDK 3.1.0 types (`prototypes/owlbear-probe/node_modules/@owlbear-rodeo/sdk/lib/api/BroadcastApi.d.ts`): the destination is only `REMOTE`, `LOCAL` or `ALL`. A message cannot target one connection.
- Probe source, commit `8ecd2ea`, `background.ts` lines 414-415: the writer's own `getMetadata` read detected the dropped write. So the read-back in AD-8 is a valid check.
- Probe `README.md`: "a new URL is a new origin", and results in browser storage do not survive a URL change. Probe `vite.config.ts`: Owlbear fetches the manifest and pages cross-origin.
- **Not verified.** `docs.owlbear.rodeo` returned HTTP 403 and no public docs repository was found. Three facts stay open: whether broadcast has a rate limit, whether `getPlayers` includes the caller, and whether the 16KB limit applies to `LOCAL` messages. The only burst data is 50 edits per client (`storage-and-sync.md`).

## Critical

### C1. AD-6 has no signal that can keep `gmLink` online

- **Where:** AD-6, AD-12. CAP-15.
- **Problem:** `gmLink` is `online` only when a GM-origin message arrived within the timeout. The closed list of `t` values holds no ping or pong. GM-origin messages are `commit`, `state`, `reset`, `reject` and `roll`. In a quiet room none of these is sent.
- **Effect:** A player who reads a sheet sees "no connection to GM" while the GM is present and healthy. The only request that draws a reply without an edit is `state-request`, and it costs a full replica from each GM client. One epic can accept the false status. Another can poll `state-request`. A third can add a heartbeat on a GM timer, which the Time convention forbids and a hidden Chrome tab cannot keep.
- **Fix:** Decide the probe. Recommended: add `ping` and `pong` to AD-12. The player sends `ping` on a schedule. A GM client answers on receipt, with no GM timer. A frozen tab does not answer, which is the behavior AD-6 wants. The other option is to compute the status only while a pending edit exists, and then AD-6 must say so.
- **Disposition:** Discuss, then fix.

### C2. The message gates drop messages that the protocol needs

- **Where:** AD-5, AD-9, AD-12. CAP-6, CAP-10, CAP-11.
- **Problem 1:** AD-5 accepts `commit`, `state`, `reset` and `reject` from a GM, and `propose` from a known player. Then: "Anything else is dropped." `state-request` and `roll` are in neither list. Written literally, catch-up and all player rolls stop working.
- **Problem 2:** AD-9 says every message carries the generation and "a client ignores a lower one". A stale or new client sends `state-request` with a lower generation, so every GM client ignores the client that most needs the state. The spine also defines no initial generation for a client that has none.
- **Scenario for problem 2:** A GM imports. The snapshot does not fit, which the spec allows, or is not written yet. A player joins or a frozen tab resumes. Its `state-request` is ignored. The client stays stale until some unrelated GM message with a higher generation arrives. In a quiet room that can be never.
- **Fix:** Make a full table: message type, allowed sender role, generation rule. Exempt `state-request` from the lower-generation rule, and have the GM reply with its current generation. Define the initial generation.
- **Disposition:** Autofix after the table is agreed.

## High

### H1. Two different edits can carry the same version

- **Where:** AD-3, AD-4, Design Paradigm.
- **Problem:** A new edit takes `c` = highest known `c` of that key + 1. A player's pending queue is outside the replica, so a second edit of one row before `commit` computes the same `c`. The author is also the same. Now two records have equal `(c, a)` and different `v`.
- **Effect:** The Design Paradigm claims merge is commutative. With equal versions and different values it is not, because arrival order decides. Usually the second edit is lost silently. With resends and catch-up, two GM clients can keep different values, and no later merge repairs that until the next edit of the key. This path is common: one record holds all fields of a preset row, and the player edits offline by design (CAP-15). "`commit` for that edit" also becomes ambiguous.
- **Fix:** "Highest known" includes pending entries of that key. Keep one pending entry per key, and a newer edit replaces it with a higher `c`. Build the new value on top of the pending value. Name the edit identity for `commit` and `reject`. State how merge treats equal `(c, a)`.
- **Disposition:** Autofix.

### H2. An edit made on stale data is confirmed and then lost

- **Where:** AD-3, AD-4, AD-7. CAP-15.
- **Problem:** A GM client merges a proposal with `c` and `a` unchanged. Catch-up can end on timeout, so a player may edit from an old snapshot or from nothing. Its `c` is then far below the live value. When a GM returns, the proposal loses the merge, and the GM still broadcasts `commit`. The player's pending entry clears as if it worked.
- **Effect:** CAP-15 says the edit is "sent again, confirmed and applied". The edit is confirmed and not applied, even if nobody touched that row after the player's edit. This is worst when the snapshot was skipped, because the player's counters are then very old.
- **Fix:** After each catch-up, the player re-stamps pending entries from the new highest known `c`. AD-4 stays intact because the stamp is set before the proposal leaves the player. State whether a pending edit may overwrite a row that changed meanwhile. If it may not, the UI needs a "lost" outcome.
- **Disposition:** Discuss, because this is a product call on which edit wins.

### H3. The UI-to-replica contract is not defined

- **Where:** AD-10, AD-12, Structural Seed.
- **Problem:** AD-10 names one thing: commands go by `LOCAL` broadcast on `app.muster-roll/ui`. AD-12 covers only room traffic. The spine does not define the command set, how the projection reaches a window, how a window opened later gets current state, or how `gmLink`, pending state, notices and rolls reach windows. The 16KB limit on `LOCAL` is unverified, and a full projection can exceed it.
- **Effect:** This is the main seam between UI epics and replica epics. Each side can choose incompatible shapes. It is also unclear whether a window or the background evaluates a formula, although AD-13 requires one evaluation and AD-10 reserves the broadcast for `replica`.
- **Fix:** Add an AD for the local protocol: message list, snapshot-on-subscribe plus per-record deltas, and a split rule that reuses the AD-12 function. State where a roll is evaluated.
- **Disposition:** Autofix after a short discussion.

### H4. Replication keys depend on preset layout, but the spec stores values by field id

- **Where:** AD-2, AD-14. CAP-4, CAP-8. Spec constraint "Values are stored apart from the template, by field id".
- **Problem:** A value lives in `row:{sheetId}:{rowId}`, so its location depends on the preset row. A GM who moves a field to another row keeps the same field id. The spec treats same-id fields as kept, but under AD-2 the value stays under the old row key. Hand-edited files make changed row ids likely. AD-14 handles only removed field ids.
- **Effect:** One epic looks up values by the current row and shows empty cells. Another searches all rows and migrates. The confirmation in CAP-8 may also miss this loss, because no field id was removed. If a whole preset row is removed, AD-14 leaves an empty `{}` record, and it uses snapshot space forever. Moves into or out of a `repeat` section have no rule.
- **Fix:** Add to AD-14 a migration by field id: on upload, re-home values to their new row and tombstone records of removed rows. Otherwise, require stable row ids in the upload check and refuse a moved field with a clear error. Define `repeat` moves.
- **Disposition:** Discuss.

### H5. Deployment, environments and operations are not decided

- **Where:** Structural Seed, line 216, and one small diagram. Deferred holds only Monitoring. There is no open-questions section.
- **Problem:** The following are neither decided, deferred nor open:
  - **The production URL and its permanence.** The origin is the storage namespace of the only full copy of the data (AD-11). The probe confirmed that a new URL is a new origin. A move from a default hostname to a custom domain orphans every GM's local data. This must be decided before the first real session.
  - **The Cloudflare product** (Workers static assets or Pages). `wrangler` supports both.
  - **CORS on production.** Owlbear fetches the manifest and pages cross-origin, and the probe needed `cors: true`. Nothing assigns this to the deploy config.
  - **Environments.** No staging or preview exists. Every deploy reaches all rooms at once. A dev tunnel URL changes on each start, so dev storage does not survive a restart.
  - **Cache policy.** The reload request in AD-12 is useful only if a reload gets the new build.
  - **Who deploys and from where,** and which token this needs.
  - **Rollback,** which interacts with H6.
  - **A live-room check before release.** `stack.md` says the mock proves app logic only.
- **Fix:** Add a short deployment section or AD. Put what can wait in Deferred with a revisit condition. The URL permanence, CORS and cache policy cannot wait.
- **Disposition:** Discuss the URL. Autofix the rest.

### H6. Build skew is not covered, although the spine says AD-12 covers it

- **Where:** Line 216, AD-11, AD-12, Deferred "Snapshot byte layout".
- **Problem:** AD-12 handles one case: an inbound message with a higher `v`. These cases have no rule:
  - An inbound message with a lower `v`.
  - An old build that reads a snapshot with a higher `v` during AD-8. A parse failure could be treated as an empty snapshot, and the merge and write would then overwrite newer data. The Deferred row says "change with `v`", but this path is undefined, so it fails the Deferred test.
  - The localStorage record format, which has no version. It holds the only full copy.
  - Exported files and the `preset` record.
  - When `v` must change.
  - A mixed room: the old build drops new messages while the new build may accept old ones, so replicas differ until reload.
- **Fix:** Add one version-policy rule. A client that cannot read a snapshot of a higher version must not write the snapshot. Add a format version to local storage and name who migrates it. Define what a lower `v` means.
- **Disposition:** Autofix after agreeing the policy.

### H7. An import can erase data

- **Where:** AD-7, AD-8, AD-9. CAP-13. Success signal "no data is lost".
- **Problem:** On a higher generation a client drops its local copy first, then runs catch-up. AD-7 stops `catching-up` clients from editing and validating, but not from writing the snapshot. AD-9 does not order the importer's steps.
- **Scenario:** The GM imports in tab A, and tab A broadcasts `reset`. Tab A closes or freezes. Tab B has dropped its local copy, and catch-up ends on timeout with an empty replica. Tab B then writes a higher-generation, near-empty snapshot over the last good one, because a lower generation is ignored in the merge.
- **Fix:** The importer persists locally and writes the snapshot before `reset`. A client does not delete its old copy until the new generation arrives complete. No client writes a snapshot while `catching-up` or with an empty replica.
- **Disposition:** Autofix.

## Medium

| ID | Where | Problem | Fix |
| --- | --- | --- | --- |
| M1 | AD-7, AD-12 | Each `state-request` makes every GM client broadcast its full replica. The SDK has no targeted send, so all clients receive all of it. Volume = GM clients x chunks x receivers. Every tab return by every player triggers this, with no dedupe or backoff. The rate limit is unverified. The memlog says compressed chunks, but AD-7 and AD-12 do not mention compression. | Add random backoff with suppression when another answer is seen (no leader, so AD-1 holds), or restrict the trigger. Decide compression. Measure the real size. |
| M2 | AD-7 | Catch-up ends at the first `last` from any GM client. A stale resumed GM can end it with old data, so the client edits and validates on the stale data that AD-7 says it prevents. Chunks from several GM clients can interleave. | Tie `last` to a responder, and allow a short window for other answers. Or state that the risk is accepted. |
| M3 | AD-4, AD-5, CAP-3 | GM clients can disagree on access. One rejects, another commits. Others accept the `commit` because only the sender role is checked. "With access off, the edit does not apply" fails during this window. The player has no rule when both `reject` and `commit` arrive. | State that `commit` beats `reject`, and accept the revoke window explicitly. Or re-check access on `commit`. |
| M4 | AD-8 | GM clients share one pause, so their timers fire together. A second writer changes the value between write and read-back, and verify raises the "does not fit" notice although all is well. | On mismatch, decode the stored value and accept it when it holds at least the written versions. Add jitter. |
| M5 | AD-12, CAP-4 | The `preset` is one record, and a record over 15000 bytes is refused. Estimate only, because JSON keys are deferred: a labeled field costs about 80 bytes, so about 187 labeled fields fill it before wrappers and dice cells. Cyrillic labels cost more. A heavy system can hit this, and CAP-4 promises any system. | Measure a real preset. Then compress the `preset` value or allow it to span messages. |
| M6 | AD-2 | No rule for deleting a sheet. Child `row:`, `rep:`, `acl:`, `link:` and `plink:` records can stay or be tombstoned, and a late edit can recreate them. Each choice changes snapshot size and `core/access`. | State the cascade, and that `core/access` refuses a tombstoned sheet. |
| M7 | AD-9, CAP-13 | Not stated: import drops `acl:` and `plink:`, and keeps the current `preset` at `c: 1`. The room snapshot needs rights and links for CAP-9, and the export file must not hold them. So there are two formats, but `core/snapshot` reads as one. | State both formats and the content of an import. |
| M8 | Design Paradigm, AD-16, CAP-13, CAP-14 | Ports are "broadcast, metadata, party and storage". Token links need scene items and the context menu, and sheets need popover or modal calls. AD-16 sends all of them through ports. Tokens belong to a scene, so "where the token exists" cannot be checked for a scene that is not open. Links to deleted tokens have no cleanup rule, and they use snapshot space. | Extend the port list. Decide what import does for tokens in other scenes. |
| M9 | AD-11, CAP-1 | No rule for `setItem` failure when the quota is full. The data is lost silently while the GM believes it saved. Keys of other rooms and dead generations are never removed, and all rooms share one origin quota. | Raise a notice on failure. Define eviction of old generations. |
| M10 | AD-7 | Catch-up runs only on start and page visibility. A network drop in a visible tab misses messages and has no repair trigger. | Add a trigger on reconnect or a return of liveness, or accept the gap explicitly. |
| M11 | AD-7, Conventions | A field can send on blur while `catching-up`. "Neither creates edits" does not say if the UI blocks input, queues it or loses it. This happens on each tab return. | State it: queue the edit and stamp it after catch-up. |

## Low

| ID | Where | Note |
| --- | --- | --- |
| L1 | AD-6, spec constraint | The spec says "a hidden tab does not count as online". AD-6 counts any tab that responds. The AD-6 choice is better, and matches CAP-15, but the spine should state the deliberate reading. |
| L2 | AD-4 | The GM's own edit path is implied only: new `c`, merge, broadcast `commit`. One sentence fixes it. |
| L3 | AD-13, CAP-6 | The roll message does not name the roller, which CAP-6 requires. Dedupe by roll id is implied. Where a result shows while the window is closed is not stated. |
| L4 | AD-2 | `order` has no type or tie-break, so two clients can add rows with equal `order`. |
| L5 | AD-12, AD-2 | `v` means value in a record and version in the envelope. Rename one before the schemas exist. |
| L6 | AD-14 | "Same batch" is split across messages by AD-12, so it is not atomic. The ignore rule covers the gap, but a stale record can bring a value back if the field id is added again later. |
| L7 | Map, frontmatter | CAP-12 cites only AD-12, and should route preset import through AD-14. CAP-14 has no AD on link lifecycle. `sources` omits the spec companions, although Deferred cites `preset-format.md`. |

## AD test

The test: two units could choose incompatibly, the call is non-obvious, and it is a real trade-off.

| AD | Result | Note |
| --- | --- | --- |
| AD-1 to AD-4 | Pass | Rules need the fixes in H1 and H2 |
| AD-5 | Pass, marginal | The SDK leaves no alternative source of trust. The value is the single check before dispatch. Needs C2 |
| AD-6 to AD-10 | Pass | Rules need C1, C2, H7, M2, M4 |
| AD-11 | Pass, marginal | AD-10 gives this to one module, so build units cannot diverge. It stays because the format outlives builds and the trade-off is real |
| AD-12 to AD-14 | Pass | Rules need H4, H6, M5 |
| **AD-15** | **Fail** | No trade-off remains. The spec's non-goals already accept interface-only hiding. Move "views use `core/visibility`" to Consistency Conventions |
| **AD-16** | **Fail** | This restates the paradigm and the dependency diagram, and `stack.md` already requires the mock. Move it to Conventions, enforced by an import lint rule |

## Deferred items

| Item | Result | Note |
| --- | --- | --- |
| Timeout and pause values | Pass, with a correction | "`replica` alone uses them" is wrong for the typing pause, which is in the UI. One owner per value still holds |
| Preset JSON keys | Pass | Required stable ids from AD-2 belong in the schema |
| Snapshot byte layout | **Fail until H6 is fixed** | "Change with `v`" relies on an undefined path that can overwrite data |
| Removing tombstones | Pass, with a note | `rep:` churn grows a tombstone set inside 16kB. The only v1 relief is an import, which resets rights. Add a revisit condition |
| Modified clients | Pass | Matches the spec |
| Server storage, D1 | Pass | Spec non-goal |
| Monitoring | Pass on divergence | Without any diagnostic export, the success signal "no data is lost" has no evidence after a session. Consider it |

## Capability coverage

| CAP | Status | Gap |
| --- | --- | --- |
| CAP-1 | Covered | M9 |
| CAP-2 | Covered | None |
| CAP-3 | Partial | M3 |
| CAP-4 | Partial | M5, H4 |
| CAP-5 | Covered | Owner of id resolution is not named in the map |
| CAP-6 | Partial | C2 stops player rolls as written. L3 |
| CAP-7 | Covered | None |
| CAP-8 | Partial | H4 |
| CAP-9 | Covered | M4 |
| CAP-10 | Covered | C2 applies after an import |
| CAP-11 | Partial | H1, M10 |
| CAP-12 | Covered, thin | L7 |
| CAP-13 | Partial | H7, M7, M8 |
| CAP-14 | Partial | M8 |
| CAP-15 | **Broken as written** | C1, H1, H2 |
