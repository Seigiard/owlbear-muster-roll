# Epic 3 Context: Players Edit Their Own Characters

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let players change their own characters without giving up GM control. The GM marks one owner per character and turns write access on or off per player and character in an inline access panel. A player with access edits fields and repeat rows. The edit waits in a pending queue and takes effect only after any GM client checks and commits it. The player sees the typed value at once, sees when the edit waits, and sees when it is denied. With no GM online the edit does not apply and stays visible. This epic adds the `propose` and `reject` half of the room protocol that Epic 2 left open.

## Stories

- Story 3.1: Grant Write Access per Player and Character
- Story 3.2: Mark the Owner of a Character
- Story 3.3: Apply a Player's Edit After a GM Check
- Story 3.4: See When an Edit Is Waiting for a GM

## Requirements & Constraints

- Write access binds to the player id, not the connection. A guest's id holds in one browser only. An account has one id across browsers.
- Write access covers the `row:` and `rep:` records of one `pc` sheet, including adding and removing repeat rows. Nothing else is writable by a player. Characters without access stay read-only for that player.
- A character has at most one owner. Choosing an owner also turns on that player's access. The GM can turn it off and the owner link stays. Changing or clearing the owner does not change the previous owner's access.
- The owner's client shows its owned characters first, marked "вы". Several owned characters sort by `(order, sheetId)`.
- A player's edit applies only after a GM client that is not `catching-up` checks the write right. v1 protects honest clients only.
- With no GM client responding, the edit does not apply on any client, the no-GM banner shows, sheets stay readable and the edit stays visible. When a GM responds, the edit is resent, confirmed and applied with no player action.
- Player clients do not persist. A pending edit is lost when the tab closes, and the no-GM banner already says so.
- No behavior may depend on timers in a hidden tab. New delays and backoff values go into the existing constants module.

## Technical Decisions

**Records.** `acl:{sheetId}:{playerId}` and `plink:{sheetId}:{playerId}` hold `{ name }`, the last known player name. Both are GM-only writes. Access on means a live `acl:` record. Turning access off tombstones it. Sheet delete already tombstones both forms in one batch.

**Owner.** Picking an owner writes that player's `plink:` and `acl:` and tombstones every other live `plink:` of the sheet. "Никто" tombstones all `plink:` of the sheet and leaves `acl:` alone. If two GM clients pick owners at once, every client treats the live `plink:` with the highest `(c, a)` as the only owner.

**Player pending queue.** `replica` owns it and exposes it in the projection. At most one entry per key, holding a field patch. A newer edit updates the entry and takes `c` = highest known `c` for the key, pending included, + 1. Only the newest version of each entry is sent as `propose`, and it is resent with backoff until answered. Keys are sent and resent independently. An edit is identified by `(k, c, a)`. The player never merges its own edit. An edit made during `catching-up` takes `c` on exit and only then is proposed.
- A repeat add holds `order` and cells. A remove holds `d: null`, which is valid from a player only on a `rep:` key.

**GM check.** A GM client validates only when not `catching-up`, and then neither commits nor rejects. `core/access` decides. In order: an identical record gets `commit`. A remove of a tombstoned `rep:` gets `commit` of the existing tombstone, echoing the proposer's `(k, c, a)`. An edit of a tombstoned `rep:` is `denied`. Then the `c` check: `c` above the current one merges with `c` and `a` unchanged and broadcasts `commit` echoing `(k, c, a)`. A low `c` gets `reject` `stale` with the current record.
- `denied` also covers: a tombstoned or `npc` sheet, a key outside the template of the sheet's kind in the current preset, a field id absent from that template, a value whose JSON type differs from its field type, no live `acl:` for the sender's player id, and any key form reserved for the GM.
- A GM client never rewrites the `d` of a `propose`. Two GM clients must produce the same record.
- When a coalesced `commit` batch replaces a player's record with a newer GM edit, the batch still carries the player's `(k, c, a)`, so the entry clears.

**Player answers.** An entry clears only on a `commit` or `reject` that matches its own `(k, c, a)`. A `commit` for an older `c` leaves it. A `reject` that matches no entry is ignored. `denied` drops the entry, returns the value and shows "Нет прав на правку". `stale`: apply the patch to the returned record, take `c` + 1 and propose again. An add keeps its cells and a remove stays a remove. If the returned record is a tombstone and the entry is an edit, drop it with the same notification. `commit` beats `reject`, and a `commit` after `denied` applies the value. A proposal that crosses a revoke in flight is an accepted race.

**Gate.** `propose` from a known player with an equal generation. `commit` and `reject` from a GM with an equal generation. A sender still unknown after one party re-read is dropped, and the entry stays pending under the normal backoff.

## UX & Interaction Patterns

- GM character header: a "Доступ" chip opens the access panel inline under the header, on `surface-bar` with a `line` border and `md` radius.
- Panel: one row per player id, GMs excluded, from players in the room and players who hold `acl:` or `plink:`, by last known name. A radio group "Его персонаж" with "Никто", and a checkbox "Может править" per row. Changes apply at once. With no players: "Пока никого нет". Always shows the guest note from the copy catalog.
- Player header shows "Можно править" or "Только чтение". With access, fields become editable and focusable, and "Добавить строку" and "Удалить" show.
- Pending: the typed value shows at once. The "Ожидает" mark in `label-sm` on the warning surface and text pair appears after a short delay with no answer, or at once with no GM. A pending new repeat row carries the mark. A pending removed row stays dimmed with the mark and its inputs disabled.
- Confirmed: the mark disappears with no message. Denied, or access revoked during an edit: the value returns, the field goes read-only on revoke, and the Owlbear notification "Нет прав на правку" shows.

## Cross-Story Dependencies

- 3.1 adds the panel and `acl:`. 3.2 adds `plink:` and owner ordering on the same panel. 3.3 needs 3.1 for the access check. 3.4 renders the 3.3 queue.
- **Gate (Epic 2).** `propose` and `reject` rows already exist in the gate table and the sender lookup through the party roster. Epic 3 adds their schemas and handlers.
- **Pending queue (Epic 2).** The catch-up queue holds GM intents and per-key field patches, replays them in arrival order on exit, and drops the pending view once live. The player queue reuses the per-key patch idea, but its entries carry `c`, are sent as `propose`, and must stay in the projection while live until answered.
- **Player view (Epic 2).** `core/visibility` already shows `acl:` and `plink:` of live characters to players. Player write commands are refused as `not-allowed` today, and Epic 3 lifts that for `row:` and `rep:` with access.
- **Liveness and banner (Epic 2).** `gmLink`, `ping`/`alive` and the no-GM banner exist. "At once with no GM" reads `gmLink`.
- **Room copy (Epic 2).** It already carries `acl:`, `plink:` and their tombstones. The size gate before Epic 3 was met by shortening new ids, and the worst-case fixture includes `acl:` and `plink:` per character.
- **Rolls (Epic 4).** A roll uses the value the client shows, pending edits included. The player-pending case was deferred to Epic 3 and needs its test here.
- **Token links (Epic 4).** `link:` is a GM-only key, so `core/access` refuses a player `propose` of it. Opening a sheet from a token is unaffected.
- Epic 5 import drops `acl:` and `plink:` and drops every pending entry with "Данные комнаты заменены".
