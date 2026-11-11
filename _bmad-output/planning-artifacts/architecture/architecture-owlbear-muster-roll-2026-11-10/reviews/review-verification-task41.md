# Verification review (TASK-41 update): Muster Roll architecture spine

Checked on 2026-11-11 against the uncommitted `ARCHITECTURE-SPINE.md` (updated 2026-11-11 for the Набор and Лист model), with the code at commit `e4286cc`. The spine was not edited.

Lens: every committed decision must be checked against reality, not only stated. (1) Do the Stack versions match `package.json` and `bun.lock`? (2) Are the rules that this update changed (AD-2, AD-4, AD-9, AD-11, AD-12, AD-13, AD-14, AD-18, AD-19, conventions) feasible against `src/`? Are its claims about current behaviour true?

## Verdict

**Pass with required changes.** The Stack table is exact. Most changed rules are feasible on the current seams. Three statements are false or not feasible as written:

- **F1.** AD-12 says that only "Очистить всё" overwrites a v1 room copy. The import path overwrites any copy that it cannot read, including a newer build's copy.
- **F2.** AD-12 and the UX need a distinct "older format" state. Today a lower `v` and garbage give the same `invalid-snapshot`.
- **F3.** AD-9 clear makes a generation with no records. The record store cannot persist such a generation, so the generation survives a restart only through the room copy.

Fix F1 to F3 in the spine before the TASK-41 build. F4 to F8 are smaller.

## Evidence used

| Source | Used for |
| --- | --- |
| `package.json`, `bun.lock` (resolved entries), `bun --version`, `tsconfig.json`, `.oxlintrc.json` | Stack |
| `src/core/{format-version,storage-key,snapshot,snapshot-import,snapshot-file,preset,preset-migrate,records,access,visibility,state-records,ids}.ts` | Format, keys, codecs, access, visibility |
| `src/replica/engine.ts`, `src/replica/record-store.ts` | Room copy write paths, import, adoption, start load, projection deltas |
| `src/core/snapshot-size.test.ts` | Deferred margin gate |
| `SPEC.md`, `preset-format.md`, `EXPERIENCE.md` | What the rules must serve |
| A throwaway bun test (deleted after the run) that calls `readSnapshot` with `v` above `FORMAT_VERSION` | Returned `newer-version`, as the code reads |

## 1. Stack

All 25 versioned rows match the `package.json` pins and the resolved `bun.lock` entries exactly. Local `bun --version` is 1.4.4, which matches `packageManager`. "Node 22.12 or later" matches `engines.node: >=22.12.0`. `skipLibCheck: true` is in `tsconfig.json`. The SDK import restriction is in `.oxlintrc.json` (lines 36 and 42).

Information only: the table leaves out three dev dependencies: `fast-check` 4.10.2, `@oxlint/plugins` 1.93.0 and `@types/bun` 1.4.4. No rule depends on them.

## 2. Changed rules against the code

| Rule | Claim or requirement | Result | Evidence |
| --- | --- | --- | --- |
| AD-12 | A v1 room copy counts as unreadable after the bump | True for reads and for the regular writer | `readSnapshot` checks only `v > FORMAT_VERSION` (`snapshot.ts:76`). A lower `v` then fails `z.literal(FORMAT_VERSION)` and returns `invalid-snapshot`. `runRoomCopyWrite` step 1 never overwrites it (`engine.ts:2528`) |
| AD-12 | A v1 room copy is "overwritten only by Очистить всё" | **False today** | F1 |
| AD-12 | "The current `v` is 2" | Target, not current | `format-version.ts:2` is `1`. F5 |
| AD-12 | A v1 file is refused | Feasible as is | `parseSnapshotFile` and `parsePresetFile` return `unsupported-version` for a lower `v` (`snapshot-import.ts:98`, `preset.ts:132`). A preset file shares `FORMAT_VERSION`, so v1 preset files are refused too. This matches SPEC line 130 |
| AD-11 | `mr2:` keys. `mr1` is never read | Feasible. The format lives in one production place | `STORAGE_FORMAT` in `storage-key.ts:6`. Build and parse both use it. F5 covers the test literals |
| AD-9 clear | Writes the empty copy over any copy, unreadable included | Feasible through the import copy path, with caveats | F1, F4 |
| AD-9 clear | Reuses import generation | The back half can be reused. The front half cannot | F4 |
| AD-9 clear | Deletes local keys of every storage format | Needs new code | The record store recognises only the current prefix. F4 |
| AD-9 clear | A generation change with no records | **Not durable locally** | F3 |
| AD-9 import | Dropped-sheet count, Лист id check | Feasible. `importSnapshot` is one pass that already counts dropped values | `snapshot-import.ts` |
| AD-4 | `core/access` checks the entry, the template, and either a live `acl:` or `players: edit` | Feasible | `ProposalContext` already carries the decoded preset (`access.ts:104`). The kind check is one line (`access.ts:148`) |
| AD-19 | A GM that commits a player's block removal tombstones the links in the next batch | Feasible | Players may already tombstone a `rep:` (`checkProposal`, `access.ts`). The committing GM can add the link tombstones in its own batch |
| AD-13 | `hidden` replaces `kind`. A player's `hidden: true` roll is forged | Feasible | One-to-one with the current forged check (`engine.ts:2104`) |
| AD-14 | Diff entry by entry, deleted-sheet count, link tombstones | Feasible. The entry layer is new work | `presetDiff` already treats a type change with the same id as a removal, and it moves repeat sections |
| Visibility convention | Visibility takes the decoded preset. A preset change can hide or show records | Feasible | `playerDelta` recomputes the whole visible set on every delta, and it withdraws what is gone (`engine.ts:861`). The UI also calls `visibleRecordMap`/`visibleSheets` (`ui/main.tsx:166`, `ui/picker/link-picker.tsx:72`), so the windows also need the decoded preset |
| AD-9 adoption of an empty generation | Catch-up completes with no records | True | `stateAnswer` sends one message when there are no records (`state-records.ts`) |
| AD-2 nanoids | Набор `sheetId` and `instanceId` | True | 12 and 8 characters (TASK-37, `ids.ts`) |
| Deferred, margin | "1500-byte gate of TASK-34" | True in substance | `REQUIRED_MARGIN = 1500` in `snapshot-size.test.ts`. It is labelled TASK-37 AC 3, and TASK-34 was the decision |

## 3. Findings

### F1. High. Import already overwrites any room copy that it cannot read, a newer build's copy included

**Claim.** AD-12 says: "a v1 room copy counts as unreadable and is overwritten only by 'Очистить всё'". It also says (unchanged): "A snapshot or file with a higher `v` is neither read nor overwritten".

**Code.** The import copy path does not have the step-1 guard that the regular writer has:

- `importCopyVerified` (`engine.ts:1448`) reads the metadata. It calls only `adoptedHigherCopy`, which returns `false` on any `readSnapshot` error (`engine.ts:1491`). Then it calls `setMetadata` with the new copy.
- So a snapshot import today overwrites an `invalid-snapshot` copy and a `newer-version` copy. After the bump, it will also overwrite a v1 copy.
- `runRoomCopyWrite` (`engine.ts:2528`) does refuse: "a copy this build cannot read is never overwritten".
- No test in `engine-import.test.ts` covers an import over an unreadable or newer copy.

**Why it matters.** "Overwritten only by clear" is false. It is also not what AD-9 clear wants. Clear needs exactly this overwrite of an unreadable copy. The newer-version case already breaks AD-12.

**Change.** Decide which writes may replace which copies, and say it once:

- Regular write: never an unreadable copy.
- Import: either refuse an unreadable copy, or replace an older-format copy but never a newer-version copy.
- Clear: an older-format copy or a corrupt copy, and decide whether a newer-version copy counts.

AD-9 says clear writes "over any room copy". That conflicts with AD-12 "a higher `v` is ... never overwritten" unless "any" excludes a newer build's copy. Then add the matching guard to `importCopyVerified`.

### F2. Medium. A lower `v` is not a distinct outcome, but the UX requires one

**Claim.** AD-12 says a v1 copy "counts as unreadable". EXPERIENCE.md lines 67, 108 and 120 require a separate GM banner, "Копия в комнате из старой версии. Очистите всё в настройках.", with its own priority. The banner is different from "room copy not saved".

**Code.** `SnapshotFailure` is `'newer-version' | 'invalid-snapshot'` (`snapshot.ts`). A lower `v` falls into `invalid-snapshot`. The engine maps that to the outcome `unreadable` and the not-saved notice (`unreadableRoomCopy`, `failRoomCopy`). With this code the UI cannot show the older-format banner.

**Change.** In AD-12, name a third read result, `older-version`, from `core/snapshot`. In AD-8 or AD-12, say that it raises the older-format notice instead of the not-saved notice.

EXPERIENCE.md line 120 also says the room shows no data "until it is cleared **or a preset is loaded**". This conflicts with "overwritten only by clear". A preset upload makes local records, but under AD-8 step 1 the room copy stays v1, and the banner never goes away. Pick one rule.

### F3. Medium. A cleared generation is not persisted locally, so the generation can be lost

**Claim.** AD-9 says: "On start a client takes the highest generation among its persisted records and the snapshot". AD-9 clear is "a GM generation change with no records".

**Code.**

- `readHighestGeneration` counts a generation only when it holds at least one readable stored record (`record-store.ts:131-146`).
- `saveGeneration(store, g, [])` sets the incomplete marker and then removes it, and writes nothing.
- Clear also "deletes this room's local keys".

So after a clear, no client stores the new generation. It lives only in memory and in the empty room copy.

**Failure path.**

1. The empty copy fails: room metadata is full with other extensions' data, or the read-back fails. The old copy stays (`removeLowerCopy` keeps an unreadable copy, `engine.ts:1503`).
2. The live clients restart. Each one reads `{ n: 0, a: "" }`.
3. A GM browser that was offline during the clear comes back with the old generation's records.
4. Its higher generation wins the gate, the others adopt it, and the cleared data returns.

This is the case that AD-9 "Prevents" names. The window lasts until the first `preset` upload writes a record.

**Change.** Persist the generation itself, for example a per-generation `#generation` key beside the existing `#incomplete` marker that `readHighestGeneration` also counts. Otherwise state the loss as accepted.

### F4. Medium. Clear can reuse only the back half of the import path, and "every storage format" needs a new remover

- **Reusable.** These steps work with an empty record list: minting the generation (`engine.ts` after `planImport`), the `importing` lock, `saveGeneration`, `replaceReplica`, `writeImportCopy`, `reset` after the copy, and `removeGenerationsBelow`.
- **Not reusable.** `planImport` (`engine.ts:1198`) needs a file and a `preset` record. It returns `preset-required` otherwise. Clear needs its own entry with its own confirmation, and no digest check.
- `writeImportCopy` adopts a readable copy of a higher generation and does not overwrite it (`adoptedHigherCopy`). That is right during a race. "Over any room copy" should say "except a higher generation, which is adopted".
- **Every storage format.** `keyGeneration`, `parseStorageKey` and `parseIncompleteMarkerKey` reject any prefix other than `STORAGE_FORMAT`. So `removeGenerationsBelow` never reaches `mr1:` keys. The clear needs a new function in `storage-key.ts` that removes by the room prefix. This is safe because a room id cannot contain `:`.
- **Other GM clients.** A GM client that adopts the clear removes only current-format keys, so its `mr1:` keys stay. CAP-31 says "the GM's local copy are gone on every client". Either adoption of a clear also removes old-format keys, or the spine limits that to the clearing browser.

### F5. Low. Two version constants, and `mr1` literals in tests

- `FORMAT_VERSION` (`format-version.ts`, `1`) and `STORAGE_FORMAT` (`storage-key.ts`, `'mr1'`) are separate. AD-11 ties `mr2` to "the format version". Derive the prefix from `FORMAT_VERSION`, or name both in one place, so one bump cannot miss the other.
- Production code has one owner for the key format. Tests and e2e support have 96 `mr1` literals in 26 files, for example `tests/support/room.ts` and `src/replica/engine-*.test.ts`. A test helper that builds keys would keep the "one place" claim true for the tests too.
- "The current `v` is 2" describes the target after TASK-41. The code is at 1. Write "TASK-41 sets `v` to 2", or accept that the spine describes the target.

### F6. Low. The Sheet names convention conflicts with the token label of a block link

The convention says that token labels read the one sheet-name function. `preset-format.md` says: "The offered token label is the block's first field". A block link label is not a sheet name. Add the block case to the convention, for example "and a block by its first field value".

### F7. Low. A Набор sheet id can still equal a Лист id, and AD-18 has no precedence

AD-2 refuses a new Набор id equal to an entry id at create. The client mints that id (`newSheetId`, 12 characters), so the feasible behaviour is to mint again, not to refuse. The same id can still appear in two other ways:

- A later preset upload adds a Лист whose `id` equals an existing Набор sheet id.
- An import keeps a file Набор sheet whose id equals a Лист id. AD-9 drops only a Лист sheet whose id is wrong.

Then `row:{id}:…` belongs to both, and the AD-18 lookup matches twice. The chance is very low with 12-character nanoids, but the lookup should be total. State one precedence, for example "a live `sheet:` record wins". Or drop such a Набор sheet at upload and at import.

### F8. Info. Deferred row attribution

The 1500-byte gate is `REQUIRED_MARGIN` in `snapshot-size.test.ts`, labelled "TASK-37 AC 3". TASK-34 made the decision. The row is correct in substance. Cite TASK-37 if the reader is meant to find the gate by name.

## 4. What holds without change

- All Stack versions, the Node floor, `skipLibCheck` and the SDK lint rule.
- AD-4 access, the AD-13 `hidden` flag, the AD-14 entry diff, AD-19 link liveness and tombstones, and visibility driven by the preset. Each one has a matching seam today: the preset in `ProposalContext`, the forged-roll check, `presetDiff`, the existing player `rep:` tombstone, and full-set player deltas.
- An empty generation completes adoption, because `stateAnswer` always sends at least one message.
- The regular room-copy writer never overwrites a copy that it cannot read, so a v1 copy survives everything except an import (F1) or a clear.
