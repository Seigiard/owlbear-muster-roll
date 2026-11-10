---
id: SPEC-muster-roll
companions:
  - preset-format.md
  - storage-and-sync.md
  - stack.md
sources:
  - ../../forge/muster-roll/forged-idea.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Muster Roll

## Why

Pain and vision. A GM who runs a game in Owlbear Rodeo has no simple way to keep the whole party and the NPCs in one room, for any game system. The simple sheet extension, dummy-sheet, stores each sheet in the player's browser. It has no room storage, no presets and no GM-owned sheets. Muster Roll gives one room GM-owned sheets that a preset defines. Version 1 is a POC without a server. It must prove that this model holds for a real session.

## Capabilities

- **CAP-1**
  - **intent:** The GM can edit every character, every NPC and the preset.
  - **success:** A GM change to any value on any sheet stays after a reload.
- **CAP-2**
  - **intent:** Players can read the character list and cannot see NPCs.
  - **success:** A player client shows every character and shows no NPC.
- **CAP-3**
  - **intent:** The GM can turn write access on or off per player and per character.
  - **success:** With access on, the player's edit reaches all clients. Characters without access stay read-only for that player. With access off, the edit does not apply.
- **CAP-4**
  - **intent:** A JSON preset defines the character sheets and the shorter NPC sheets for any game system (`preset-format.md`).
  - **success:** A preset for a second system gives working sheets with no code change.
- **CAP-5**
  - **intent:** The preset controls sheet layout through aligned columns, inline flow and repeated rows.
  - **success:** Rows in a `columns` section align in one grid. A `repeat` section gives each character its own number of rows. Ids resolve inside the row first, then globally.
- **CAP-6**
  - **intent:** Anyone who can see a sheet can roll its dice cells. Everyone in the room sees the result of a roll from a character sheet.
  - **success:** `1d20 <= str - 2*str_tired` with filled fields rolls once, and all connected clients show the same result with the roller's name. A roll from an NPC sheet shows only on GM clients.
- **CAP-7**
  - **intent:** A formula with bad input refuses to roll.
  - **success:** A formula with an empty, non-numeric or removed field shows an error. No roll and no broadcast occur.
- **CAP-8**
  - **intent:** The GM can change the preset by uploading a JSON file after sheets exist, and the change applies to all sheets.
  - **success:** A new field is empty on all sheets. A rename keeps the values. When an upload removes fields that hold values, one confirmation for the whole upload warns that the data will be lost, and the values are then erased on all sheets. Any other upload shows a short notice that the format changed.
- **CAP-9**
  - **intent:** Room data stays after a reload and after re-entry to the room.
  - **success:** A GM reload keeps all data. The snapshot is written when it fits. When it does not fit, it is skipped and the GM sees a notice. Room metadata never goes past the limit.
- **CAP-10**
  - **intent:** Players can read the last snapshot when no GM is online.
  - **success:** With no GM online and a snapshot present, a player sees the characters from it. No live edit is exchanged.
- **CAP-11**
  - **intent:** Edits sync live between GM tabs, GM devices and players.
  - **success:** Edits to different rows from two GM tabs both stay. Two edits of one row settle on the latest version on all clients.
- **CAP-12**
  - **intent:** The GM can export and import the preset as a JSON file.
  - **success:** The file holds no values. Import into another room gives the same structure.
- **CAP-13**
  - **intent:** The GM can export and import a room snapshot as a JSON file.
  - **success:** The file holds values and token links. Import replaces all room data after confirmation. Values of field ids not in the current preset are dropped, and the GM sees their count. Import restores a token link where the token exists. Import resets player links and write rights to read.
- **CAP-14**
  - **intent:** A user can open a linked sheet from its token.
  - **success:** The sheet opens for those who can already see it. An NPC sheet opens only for the GM.

## Constraints

- No own server in v1. Live exchange needs a GM online. A hidden GM tab in Chrome stopped receiving edits after about 13 minutes, so a hidden tab does not count as online.
- Full data lives in the GM's browser. Room metadata holds only a compressed snapshot, and only when it fits.
- Room metadata is under 16kB in total and is shared with other extensions. The extension checks free space before it writes, because Owlbear reports success for a write past the limit and drops it.
- Broadcast messages are limited to 16KB.
- Formulas run through a small parser, never `eval`, because presets are shared files.
- Values are stored apart from the template, by field id.
- Every GM tab and device can edit.
- A player's edit takes effect only after a GM client checks the write right.
- A write right binds to the player id. A guest's id holds only in one browser. An account has one id across browsers.
- A room has one preset file. It holds a character template and a short NPC template, and all sheets follow it.
- Hirelings and pets are characters, so NPCs stay GM-only.
- The interface matches the simplicity of dummy-sheet. Muster Roll takes no code or storage from it.

## Non-goals

- Own server or Cloudflare storage in v1. v2 plans Cloudflare D1 with version-checked writes and a GM write key, which removes the 16kB limit and the dependence on one browser.
- Cloudflare KV in any version. Reads can lag 60 seconds or more, and writes are not atomic.
- dummy-sheet as a code or storage base. It stores each sheet in the player's browser.
- One editing GM tab.
- Per-character sections, computed display fields and per-edit approval.
- An in-extension preset editor and per-field confirmation of a preset upload. Presets are usually set before a game.
- Past the POC: a separate preset editor with preview, request-and-confirm write access, + and − buttons as a property of number fields, token-linked stats, guest "open this character", sending rolls to the Dice extension.
- Merging two simultaneous edits of one row. Only the latest stays.
- Merging an imported snapshot into room data.
- Hiding NPC data from a modified client. NPC sheets and NPC rolls are hidden in the interface only, and any client can read the room snapshot.
- Protection of the local copy before v2, other than the room snapshot and manual export.

## Success signal

- One real session runs with the party and NPCs kept only in the extension, and no data is lost.
- A preset for a second system is built without code changes.

## Assumptions

- Players read the full sheets of all characters, not only names.
- "Globally" in id resolution means inside the same character's sheet, never across characters.
- An unchecked check counts as 0 and is not an empty field.
- A `text` cell is fixed label text from the preset, with no id and no stored value.
- Write access to a character includes adding and removing its `repeat` rows.
- A joining client gets current data from an online GM client, otherwise from the last snapshot.

## Open Questions

- What happens to a player's edit while no GM client responds, for example when Chrome has frozen a hidden GM tab? Player edits take effect only after a GM client checks them.
