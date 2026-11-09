# Muster Roll: forged idea

System-agnostic character and NPC sheets for one Owlbear Rodeo room, driven by a preset. Simplicity reference: dummy-sheet's interface, not its code or storage.

## POC scope (v1, no server)

- **Roles:** the GM edits everything. Players read the character list. The GM toggles write access per player per character.
- **NPCs:** GM-only. Hirelings and pets are characters.
- **Preset:** JSON template of sections and text rows (name, value). List sections let each character add rows.
- **Live preset:** edits apply to all sheets. A new field is empty, removal confirms and erases values, rename keeps values.
- **Storage:** full data in the GM's browser. A compressed snapshot in room metadata when it fits. The extension checks free space before it writes and skips the snapshot when it does not fit.
- **Sync:** edits go by broadcast with a version per row, latest version wins. All GM tabs and devices can edit. Live exchange needs a GM online.
- **Export:** two JSON files. Preset is structure only. Room snapshot has values and token links; player links and write rights reset to read on import.

## POC success

One real session with party and NPCs kept only in the extension and no data lost, plus a preset for a second system built without code changes.

## Later

- v2: Cloudflare D1 storage with version-checked writes and a GM write key. Removes the 16kB limit and the dependence on one browser.
- Request-and-confirm write access, field types (counters), token-linked stats, guest "open this character", dice integration.

## Rejected

- dummy-sheet as a base: it stores each sheet in the player's browser.
- Own server in v1: the user accepts needing a GM online.
- Cloudflare KV: reads can lag 60 seconds or more and writes are not atomic.
- One editing GM tab: every tab must edit.
- Per-character sections, formulas, per-edit approval.

## Constraints and open risks

- Room metadata is under 16kB in total and shared with other extensions. Broadcast messages are limited to 16KB.
- Measured on synthetic data with English notes: 6 PC + 60 NPC is about 13kB compressed without per-sheet structure. Russian text and the preset add more.
- Not tested in Owlbear: the sync scheme and how long `background_url` stays alive.
- Docs do not state whether a guest keeps the player id in another browser, or what happens past 16kB.
- Two simultaneous edits of one row keep only the latest.
- Hidden NPCs are hidden in the interface only: any client can read the room snapshot.
- Local copy loss: only the room snapshot and manual export protect it until v2.
