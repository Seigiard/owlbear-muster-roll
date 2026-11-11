# Storage and sync

## Data copies

| Copy | Location | Content | Written |
| --- | --- | --- | --- |
| Full data | GM's browser | All data | Always |
| Room snapshot | Room metadata | Compressed data | Only when it fits free space |
| Manual export | Files the GM downloads | Preset, or room snapshot | On GM request |

If the snapshot does not fit, the GM sees a notice and play continues by broadcast. Two things are lost: reading with no GM online, and moving to another GM device.

## Sync rules

- Edits go by broadcast with a version per row.
- The latest version wins, also when copies diverge.
- Edits to different rows both stay. Of two simultaneous edits of one row, only the latest stays.
- All GM tabs and devices can edit.
- A player's edit goes by broadcast. A GM client checks the write right before the edit takes effect.
- Live exchange needs a GM online.
- While no GM client responds, a player edit does not apply. The player sees a "no connection to GM" status, and the client resends the edit until a GM client confirms it.

## Export files

| File | Holds | On import |
| --- | --- | --- |
| Preset | Structure only | Gives the same structure |
| Room snapshot | Values and token links | Replaces all room data after confirmation. Drops values of field ids not in the current preset, and sheets of a sheet set or single sheet the preset lacks, and shows both counts. Restores a token link where the token exists. Resets player links and write rights to read |

A v1 preset or snapshot is refused with a message. v1 room data is not read. A wipe («Очистить всё», CAP-31) removes the preset, every record, the room copy and the GM's local copy of the room after one confirmation.

## Platform limits

- Room metadata is under 16kB in total and is shared with other extensions.
- Broadcast messages are limited to 16KB.
- Measured in a live room: messages of up to 20000 ASCII bytes and 32000 Cyrillic bytes were accepted and delivered, so the 16KB limit was not enforced in that range. Stay under the documented limit.
- Measured broadcast rate limit: 30 messages at once passed and the rest were refused with `RateLimitHit`. 25 messages per second for 4 seconds passed, 50 per second were refused after 56 messages. Refused messages did not arrive, and sending worked again within about 1 second. Two connections of one account each sent 25 per second at once with no refusal, so the limit was not shared between them. `LOCAL` messages hit the same limit.
- Measured `LOCAL`: a window and the background page exchanged messages in under 10 ms, up to 40000 bytes. The sender also receives its own `LOCAL` message.
- Measured in a live room: 16000 bytes of metadata JSON were stored, 16050 were not. A write past the limit resolves as a success and is dropped. The earlier data stays, other clients get no change event, and later small writes still work.
- Measured in a live room: two GM connections of one account and a guest each sent 50 edits at once to a shared row and an own row. All clients received every edit in order and ended with the same data.
- A hidden tab runs timers late: gaps of 3 seconds in Firefox and up to 60 seconds in Chrome were measured. Do not depend on timers in a hidden GM tab.
- Measured with a hidden GM tab. Firefox: 34 minutes hidden, every ping received. Chrome: every ping received for about 13 minutes, then the page stopped timers and messages until the GM returned 27 minutes later. The page resumed without a restart. One observation per browser. A second Chrome run stayed hidden for 19 minutes with no freeze: timers ran every 60 seconds and messages kept arriving.
- Measured player ids: a guest kept its id across reloads, a rename and about 2.5 hours, and got a new id in another browser. An account had one id in two browsers.
- Measured party list: `getPlayers` omits the caller. Other GM connections of one account are listed with role GM and the same player id, and their `connectionId` matches the broadcast sender.
- Measured metadata read-back: the writer's read at 1 ms already showed the dropped write and the earlier data, and at 8 ms a stored write. No delay is needed before the read-back.
- Measured Safari: `localStorage` in the extension iframe survived a reload. Retention over days was not tested.
- The Player and Room SDK APIs expose no signed token. A server cannot verify by itself that a request comes from the GM, so v2 needs a GM write key.

## Size measurements

Deflate plus base64, on synthetic data with English notes.

| Party | Values with per-character item names | Full structure per sheet (rejected) |
| --- | --- | --- |
| 5 PC + 20 NPC | 5.6kB | 7.0kB |
| 6 PC + 30 NPC | 8.5kB | 10.5kB |
| 6 PC + 60 NPC | 13kB | 16.7kB |

Russian text and the preset add more. These measurements predate the typed-field format, so measure again on the real format. Measured again on the sheet set and single sheet format (TASK-41, `src/core/snapshot-size.test.ts`): `tests/fixtures/presets/d20.json` with 6 sheets of a sheet set, a linkable NPC single sheet with 60 repeat blocks and links, and 3 other single sheets gives a room copy of 9270 bytes, a margin of 6230 bytes over the 1500-byte gate.

## Accepted losses

- Until v2, only the room snapshot and manual export protect against loss of the local copy.
- Hidden sheets and their rolls are hidden in the interface only. Any client can read the room snapshot.
