# Epic 5 Context: Change the Format and Move the Campaign

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let a campaign outlive one preset version and one room. The GM uploads a changed preset after sheets exist. One pass over all sheets moves values by field id and erases the values of removed fields after one confirmation, and the generation does not change. The GM downloads the room's data as a snapshot file and loads it into another room or on another computer. The import replaces all room data under a new generation and resets owners and write rights to read. The epic ends with a release check in a live room and one real session in which the extension is the only record. This epic adds the `reset` message and full generation adoption, which Epic 2 left open.

## Stories

- Story 5.1: Change the Preset Over Existing Sheets
- Story 5.2: Download a Room Snapshot
- Story 5.3: Replace the Room From a Snapshot
- Story 5.4: Prove the Release in a Real Session

## Requirements & Constraints

- Preset change: a new field is empty on every sheet. A renamed field with the same id keeps its value. A removed field, and a field whose type changes under the same id, loses its values. One confirmation per upload names how many values will be erased. Any other upload shows a short notice. A formula that names a removed field shows the bad formula error and sends nothing.
- A preset upload runs only when the client is not `catching-up`, and it never changes the generation.
- The snapshot file holds values and token links only. An import needs a preset in the room. Nothing is written before the confirmation. Values of field ids absent from the template of the sheet's kind, values whose type differs from the current field, and values moved across a `repeat` boundary are dropped and counted.
- After an import every player is read-only and no character has an owner. A token link works where the token exists. A link to an absent token is inert.
- An invalid or newer file changes nothing. A file with a lower `v` is read only through a migration in `core`.
- Room metadata never goes past its limit. A room copy that does not fit is skipped with the not-saved notice.
- An import by another GM drops every client's pending edits with a notification.
- No behavior may depend on timers in a hidden tab. New delays and backoff values go into the existing constants module.
- Release: a preset for a second game system, built by hand, gives working sheets with no code change. The owner deploys the release candidate (human gate), and the release check in a live room covers preset upload and download, a GM edit, owner assignment, a player edit, a character roll, an NPC roll seen only by GM clients, a token open, a no-GM read, an edit followed by closing the window at once, and snapshot download and import. In one real session (human gate) a snapshot exported at session end matches one exported after a reload and after re-entry on a second GM device. The owner records any lost value in Backlog. Deferred timeouts, pauses and spacing are confirmed or adjusted from that session.
- The production URL does not change. A rollback may not cross a `v` change.

## Technical Decisions

**Preset diff.** Preset upload and preset import are one path in `replica`. One `core/preset` diff runs over the full replica, per template and sheet kind. It returns the removed field ids that hold a value and `{count}`, the number of stored values to erase across all sheets. A key present with `false` holds a value. A field moved across a `repeat` boundary counts as removed, and so does a type change. On confirm, the diff runs again only if the replica changed. A different count needs a second confirmation. A count of 0 takes the removes-nothing path.

**Rewrite batch.** The batch writes `preset`, moves values by field id to the row that now holds them, strips removed ids and tombstones records of rows that no longer exist. A `rowId` and a `sectionId` are the first field id of their preset row, so a changed first field changes the key. A `rep:` record moves to the new `sectionId` with its `instanceId`, `order` and surviving values when at least one field id of the repeat template row survives. Otherwise it is tombstoned and all its values are counted. Send order: new-key rows, then `preset`, then tombstones of old keys and stripped rows. A closure at any point then leaves values readable under one of the two presets. If the uploader closes mid-batch, an erased value can return only when the same field id is added again, which is an accepted loss.

**Strip on write.** Every later write that mints a new `c` strips field ids absent from the template of the record's sheet kind, and values whose type differs from their field.

**Snapshot file.** It is a different format from the room copy. It holds the current `v`, every live sheet with id, kind, name and order, row values, repeat rows with instance id and order, and token links. It holds no `preset`, `acl:`, `plink:`, tombstones or versions. A zod schema in `core` parses it.

**Import.** `core/snapshot` takes the file and the current preset. It returns records at `c: 1` and the dropped-value count. The output carries the current `preset`, all `link:` records from the file, and no `acl:` or `plink:` record. A value is placed by field id inside the template of its sheet's kind, also when the field is now in another row.

**Generation.** A generation is `{ n, a }`, ordered like a record version, and starts at `{ n: 0, a: "" }`. Only an import changes it. GM storage keys carry it: `mr1:{roomId}:{n}:{a}:{k}`. The importer takes a higher generation, persists it, writes the room copy, and only then broadcasts `reset`. If local persistence fails, the import stops before the room copy and `reset`, the local-save notice shows, and nothing changes. If the room copy does not fit or fails read-back, the import still finishes, `reset` goes out, the not-saved banner shows, and a room copy of a lower generation is removed from room metadata, so players with no GM do not read replaced data.

**Adoption.** The gate accepts `reset` from a GM with a higher generation. Any message with a higher generation also starts adoption, including a room copy read by the snapshot writer. The client drops its pending queue with the notification and runs catch-up. It keeps its old copy until the new generation is complete, then deletes it. Complete means all `n` messages of one responder, or a decoded room copy of the new generation. While incomplete, the client stays `catching-up` past the timeout, writes no room copy, does not answer `state-request`, `ping` or `propose`, and repeats `state-request` with backoff. On start, a client takes the highest generation among its persisted records and the room copy.

## UX & Interaction Patterns

- Settings sections in this order: Пресет, Снимок, Копия в комнате. The first action is `button-primary`, the others `button-secondary`. Results and file errors appear under the button that caused them.
- "Загрузить пресет" stays enabled when sheets exist.
- With no preset, "Скачать снимок" and "Загрузить снимок" are disabled with "Сначала загрузите пресет.". During catch-up, upload, import and download buttons are disabled with "Загрузка…".
- Confirmation: one inline block for the whole action at the top of the content area, on `surface-bar` with a `line` border and `md` radius. Focus moves to "Отменить", and "Отменить" changes nothing. The block closes when `catching-up` starts. The import block also follows the delete block's close rules.
- Exact copy: "Значения удалённых полей будут стёрты: {count}. Загрузить пресет?", "Формат листов изменён.", "Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?", the added "Не войдут значения удалённых полей: {count}.", the bad file and newer file messages, and the notification "Данные комнаты заменены".
- Banner priority stays: local save failed, room copy not saved, new version, no GM.

## Cross-Story Dependencies

- 5.1 lifts the Story 1.5 lock, which disables "Загрузить пресет" with "Удалите листы, чтобы заменить пресет." and refuses the command as `sheets-exist`. 5.1 also owns the result text under the button after a replace.
- 5.2 adds the "Снимок" section between "Пресет" and the existing "Копия в комнате". 5.3 reads the file format that 5.2 writes. 5.4 needs all of the epic.
- **Epic 1.** Preset file checks, bad file reasons, the newer-file rule and the download pattern exist. The delete confirmation (1.7) closes on cancel or Escape, on a tab change, when its target disappears, and when the window closes.
- **Epic 2.** Catch-up already refuses a preset upload while `catching-up` and disables the Settings controls. The gate table already lists `reset`. A GM client that holds records enters catch-up on a higher generation but does not adopt it yet, and Epic 5 completes that path. The room copy writer, its notices and the Settings size line exist. A room copy of a lower generation is not merged.
- **Epic 3.** Player pending entries already drop on a higher generation. The GM catch-up queue of intents must drop too. `core/access` denies a player edit of a field id outside the current template, and checks only the values a proposal sets or changes.
- **Epic 4.** The formula evaluator already errors on a removed field. Token status reads `link:` records only, never the scene, so an imported link to an absent token stays inert with no extra code.
- **Size.** The room copy margin rests on short ids for new sheets and repeat rows. Rooms built before that change keep long ids and a thin margin, and an import writes the file's ids.
