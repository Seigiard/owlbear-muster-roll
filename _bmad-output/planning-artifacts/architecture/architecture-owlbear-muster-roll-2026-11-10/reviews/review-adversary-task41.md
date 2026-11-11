# Adversary review — TASK-41 spine update (Набор and Лист)

Reviewed: `ARCHITECTURE-SPINE.md` (status final, updated 2026-11-11), against `SPEC.md` and `preset-format.md`. Focus: AD-2, AD-4, AD-9 (clear), AD-11, AD-12 (v2), AD-13 (hidden), AD-14 (diff per entry), AD-18, AD-19, the Visibility and Sheet names conventions, and the capability map.

## Verdict

**Revise.** The model change is sound in shape. One entry resolver (AD-18), record keys per sheet id (AD-2) and inert links (AD-19) absorb most races. But two units can each obey the letter and still break a common session:

- A preset edit that reorders the first row of a repeat section silently deletes every block token link (finding 1).
- A sheet id can name a Набор sheet and a Лист at once, so two owners claim one set of `row:` records (finding 2).

Findings 1 to 4 need a one- or two-sentence tightening each. None changes the paradigm.

## Method

- For each changed AD I built two units one level down and read only the AD text when designing each. A pair counts as a hole when both obey every AD and still clash.
- I read the current code (`src/core/access.ts`, `preset-migrate.ts`, `snapshot-import.ts`, `dice-plus.ts`, `src/replica/engine.ts`) to see what the old model does today. Where the code already avoids the hole, the finding says so: the spine must still state the rule, because the TASK-41 rewrite will replace that code.
- Pairs I tried that hold are listed at the end.

## Findings

| # | Pair | Kind | ADs | Severity |
| --- | --- | --- | --- | --- |
| 1 | Upload diff / snapshot import vs block link liveness | Data loss, uncounted | 2, 9, 14, 19 | High |
| 2 | Entry resolver vs snapshot import vs upload diff | Two owners of one entity | 2, 9, 14, 18 | High |
| 3 | Player proposal composer vs GM access check during an upload | Lost edit | 4, 14 | Medium |
| 4 | Upload strip composer vs block removal meaning of `d: null` | Clashing data shape | 2, 4, 14, 19 | Medium |
| 5 | Clear composer vs start-time generation pick | Clear undone | 5, 9 | Medium |
| 6 | Roll composer vs Dice+ request builder | Hidden roll shown | 13, 18 | Low |
| 7 | Import room-copy removal vs v1 copy protection | Contradiction | 9, 12 | Low |
| 8 | Format key `mr2` vs migration rule | Future dead end | 11, 12 | Low |

---

### 1. A block link names a derived id that moves

**Unit A: the AD-14 upload diff** (and the AD-9 import, which places values the same way).
AD-14 says the batch "moves values by field id to the row that now holds them". `sectionId` is "the id of the first `field` of a `repeat` section" (AD-2). So when the GM inserts a field before the first field of a repeat section, or reorders that row, the section gets a new `sectionId`. Unit A moves each block from `rep:S:old:I` to `rep:S:new:I` and keeps `instanceId` and `order`. Today's `preset-migrate.ts` and `snapshot-import.ts` do exactly this through `sectionTarget`. The import can also merge two file sections into one current section.

**Unit B: the AD-19 link check and the AD-14 link cleanup.**
A block link is `{ s, r, i }`. It is live only while "its block is live". The block `rep:S:old:I` is now a tombstone. So the link is not live. AD-14 then tombstones "links whose target AD-19 no longer allows", and "link tombstones are not counted".

**Clash.** The GM moves one field in the preset of the NPC Лист. Every skeleton token loses its link. No confirmation names it, because link tombstones are not counted and the block itself survived. After an import of a file from before such an edit, every block link is inert. CAP-13 says import "restores a token link where the token exists", and the spec lists only "drops `tokens`" and "removes the block" as reasons to lose a link.

**Fix (AD-2, AD-19).** Drop `r` from a block link: `link:{tokenId}` holds `{ s, i }`. The block is the live `rep:{s}:*:{i}`, and its section (for the `tokens` check) is read from that record's key. Add to AD-2: "An `instanceId` is unique within its sheet. A pass that moves a `rep:` record to a new section keeps its `instanceId`. An import drops a second block with one `instanceId` in one sheet." Smaller alternative, if the shape must stay: "A pass that moves a `rep:` record rewrites `r` in every `link:` that names it, in the same batch, before `preset`."

### 2. One sheet id can resolve to a Набор sheet and a Лист

**Unit A: the AD-18 resolver.** It has two clauses: "a live `sheet:` record's `set` names a Набор, and a `sheetId` equal to a Лист id names that Лист". Their order is not given.

**Unit B: the AD-9 import and the AD-14 upload.** AD-2 refuses a new Набор sheet id equal to an entry id only "at create". The import drops "a Лист sheet whose id is not its entry id", but keeps a Набор sheet whose id equals a Лист id. The upload may add a Лист whose id equals a live Набор sheet id. The spine also never says that entry ids are unique in a preset.

**Clash.** A file (hand-edited, or from a room where `inv` was a Набор sheet id) holds Набор sheet `inv`, and the current preset has Лист `inv`. After import, `sheet:inv` and Лист `inv` both own `row:inv:*`. The views show one sheet, the access check applies the Набор rule, and the upload diff deletes or keeps the rows depending on which clause it reads first. The same holds when one preset has a Набор and a Лист with one id.

A second split in the same resolver: AD-4 and AD-2 branch on Набор vs Лист (`acl:` vs `players: edit`), while AD-18 says "no code branches on a sheet kind enum". One implementer reads that literally and derives the write rule from properties (a Набор with `players: edit` becomes open to all players). Another branches on `kind`.

**Fix (AD-18, preset schema).** Add: "The preset schema refuses two entries with one `id`. A `sheetId` equal to an entry id is that entry's Лист or nothing: a `sheet:` record with such an id, or whose `set` names no entry of kind `many`, resolves to no entry. The import drops such a sheet and counts it. The resolver returns the sheet's policy: template, hidden, write rule (`acl`, `all`, `none`), name source and `tokens`. Only the resolver reads `kind`." Then AD-2's create-time refusal becomes one case of the rule.

### 3. A proposal built on the old preset is denied, and the edit is lost

**Unit A: the player's composer.** AD-14: "every later write that mints a new `c` strips field ids absent from the template of the record's entry". The player's replica still has the old preset, so it keeps field `F` in the row and changes only `G`.

**Unit B: `core/access` on a GM client with the new preset.** AD-4: it passes a record "only when every field it sets is in that entry's template". `F` is not, so it sends `reject denied`. AD-4: "the player drops the entry and shows a notice".

**Clash.** During an upload, any player edit of a row that held a removed field is lost with a "denied" notice, although the player has write access. Today's `access.ts` avoids this: it checks only the values a record "sets or changes against the current record". The spine text does not carry that rule, so the rewrite can lose it.

**Fix (AD-4).** "`core/access` judges only the fields whose value differs from the current record. A proposal that carries any other field id absent from the template gets `reject stale` with the current record, not `denied`." The player then re-applies its patch to the stripped record, as AD-4 already says for `stale`.

### 4. An emptied block has two shapes, and one deletes it

**Unit A: the AD-14 strip.** "Strips removed ids". When every value of a block was in removed fields, the block holds no value. AD-2 says "An empty field has no key" and "`d: null` is a tombstone", but not what an all-empty record is. One implementer writes `d: null` for "no values left".

**Unit B: the AD-19 link check, the AD-4 check and the views.** For a `rep:` key, `d: null` is a removed block. The block disappears from the sheet, its links become inert, and the next upload tombstones them. For a `row:` key, AD-4 lets `d: null` pass by letter, because a tombstone "sets" no field. Today's `access.ts` refuses `null` on `row:`. A GM composer that writes `null` when the last field of a row is cleared is then incompatible with a player composer, whose identical edit is denied.

**Clash.** An upload that removes the fields of a repeat section that still exists deletes blocks the GM meant to keep, together with their links. Clearing the last field of a row works for the GM and is denied for a player.

**Fix (AD-2).** "An emptied record keeps a non-null `d`: `{}` for `row:`, `{ order, cells: {} }` for `rep:`. Only a block removal, a sheet delete, an upload that removes the row or section, and a generation change write `d: null`. A player sends `d: null` only for a `rep:` key." Today's code already keeps `{ order, cells: {} }`.

### 5. A clear can be undone by a device that knew a higher generation

**Unit A: the clear composer (AD-9).** "A GM generation change with no records". AD-9 does not say how `n` is chosen, nor that the clear waits for the end of catch-up. The clear is meant to work "in a room whose data has an older format", which is exactly when the clearing client knows least: the v1 room copy is unreadable, and v2 GM clients never wrote over it (AD-8 step 1 stops on it). So a fresh GM device computes `n = 1`.

**Unit B: start-time generation pick and adoption.** "On start a client takes the highest generation among its persisted records and the snapshot." AD-5 accepts `reset` only when higher. A message with a higher generation "also starts AD-9 adoption".

**Clash.** GM device A imported in a v1 room earlier and holds `{1, A}` locally. Device C clears and mints `{1, C}`. If `A > C` as strings, A drops the `reset`, its `alive` carries a higher generation, and C adopts A's data. The clear is undone in every client. The same happens when C's last room copy is older because AD-8 skipped a write that did not fit.

**Fix (AD-9).** "A generation change is composed only by a GM client that is not `catching-up`. It takes `n` = 1 + the highest `n` this client has persisted, read in a room copy, or seen in any message. A GM device that was offline during the change and holds a higher generation wins on its return; this is an accepted loss." Today's engine already uses `max(own, highestSeen) + 1`, so the rule only records it. Also add to the adoption rule: "A GM client that adopts a generation with no records deletes this room's local keys of every storage format", so CAP-31 ("the GM's local copy are gone on every client") holds beyond the clearing tab.

### 6. Roll visibility can be decided twice

**Unit A: the AD-13 roll composer.** `hidden` is "the visibility of the sheet's entry at roll time". The roll message is composed after evaluation.

**Unit B: the Dice+ request builder** (`src/replica/dice-extension.ts`, `core/dice-plus.ts`). It sends the dice to the Dice+ extension with a target of `everyone` or `gm_only` before the faces return. Today it derives the target from the old sheet kind. The spine does not name this unit at all, though the code ships it.

**Clash.** An upload that hides the entry between the Dice+ request and its result gives a Dice+ roll shown to every player and a Muster Roll message with `hidden: true`, or the reverse.

**Fix (AD-13).** "`hidden` is computed once when the replica accepts the roll request. Every output of that roll, the `roll` message and any dice-extension target, uses that value." Name the dice-extension path in AD-13 or in Deferred.

### 7. The import removes a room copy that only "Очистить всё" may overwrite

AD-9 import: "the old-generation copy is removed from the room". AD-12: "a v1 room copy counts as unreadable and is overwritten only by «Очистить всё»". A v1 copy has no readable generation, so one implementer removes it on import and another keeps it. Today's `removeLowerCopy` keeps any copy it cannot read.

**Fix (AD-9).** Write "a readable copy of a lower generation is removed from the room; a copy this build cannot read stays".

### 8. `mr2` blocks the migration path that AD-12 opens

AD-11: "Keys of format `mr1` are never read", with the format version in the key. AD-12: a lower `v` "is read only through a migration in `core`". When `v` becomes 3, an implementer of AD-11 ignores `mr2` keys, and one of AD-12 migrates them. This does not bite in TASK-41.

**Fix (AD-11).** "A client reads only keys of the current format version, and of a lower one through a migration in `core`. No migration from `mr1` exists."

## Pairs tried that hold

- **Block duplicate composer vs access check.** Duplicates are new keys at `c: 1`, GM-only, with no link. A player's block add looks the same to `core/access`, which is fine for honest clients. Concurrent duplicates from two GM clients get equal `order`, and the tie goes to id.
- **Visibility filter vs the AD-14 batch.** New-key rows go before `preset`, so a client on the old preset never reads them. Tombstones go after `preset`, so deleted sheets are already hidden by AD-18 when they are removed.
- **Kind change with one id (many to one or back).** AD-14 deletes the old entry's sheets. Once finding 2 makes the resolver check `kind`, an old `sheet:` whose `set` now names a Лист resolves to nothing.
- **Link composer vs concurrent block removal on another GM client.** A link composed to a block that was just removed is inert by AD-19, and the next upload cleans it up.
- **Clear and an empty `state` answer.** AD-7 needs all `n` messages. Today's `splitBatch` sends one message for an empty batch. Worth one clause in AD-7 ("an empty answer is one message"), but no clash today.
- **Sheet names.** The name field row is an ordinary `row:`, so a rename is a field patch that AD-4 already checks. The block label (first field) used by the link picker and the duplicate numbering is not in the Sheet names convention. Adding "and a block by its first field value" would keep token labels from two code paths.
