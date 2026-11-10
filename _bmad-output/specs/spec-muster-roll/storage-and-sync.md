# Storage and sync

## Data copies

| Copy | Location | Content | Written |
| --- | --- | --- | --- |
| Full data | GM's browser | All data | Always |
| Room snapshot | Room metadata | Compressed data | Only when it fits free space |
| Manual export | Files the GM downloads | Preset, or room snapshot | On GM request |

If the snapshot does not fit, play continues by broadcast. Two things are lost: reading with no GM online, and moving to another GM device.

## Sync rules

- Edits go by broadcast with a version per row.
- The latest version wins, also when copies diverge.
- Edits to different rows both stay. Of two simultaneous edits of one row, only the latest stays.
- All GM tabs and devices can edit.
- A player's edit goes by broadcast. A GM client checks the write right before the edit takes effect.
- Live exchange needs a GM online.

## Export files

| File | Holds | On import |
| --- | --- | --- |
| Preset | Structure only | Gives the same structure |
| Room snapshot | Values and token links | Restores a token link where the token exists. Resets player links and write rights to read |

## Platform limits

- Room metadata is under 16kB in total and is shared with other extensions.
- Broadcast messages are limited to 16KB.
- The Player and Room SDK APIs expose no signed token. A server cannot verify by itself that a request comes from the GM, so v2 needs a GM write key.

## Size measurements

Deflate plus base64, on synthetic data with English notes.

| Party | Values with per-character item names | Full structure per sheet (rejected) |
| --- | --- | --- |
| 5 PC + 20 NPC | 5.6kB | 7.0kB |
| 6 PC + 30 NPC | 8.5kB | 10.5kB |
| 6 PC + 60 NPC | 13kB | 16.7kB |

Russian text and the preset add more. These measurements predate the typed-field format, so measure again on the real format.

## Untested or undocumented

- The sync scheme has not run in Owlbear.
- How long `background_url` stays alive is not tested.
- The docs do not say whether a guest keeps the player id in another browser. Write rights bind to that id.
- The docs do not say what happens past 16kB of room metadata.

## Accepted losses

- Until v2, only the room snapshot and manual export protect against loss of the local copy.
- NPCs are hidden in the interface only. Any client can read the room snapshot.
