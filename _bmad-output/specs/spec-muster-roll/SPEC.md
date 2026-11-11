---
id: SPEC-muster-roll
companions:
  - preset-format.md
  - storage-and-sync.md
  - stack.md
  - preset-builder.md
  - ../../../docs/preset-format.md
  - ../../planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
  - ../../planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
sources:
  - ../../forge/muster-roll/forged-idea.md
  - ../../forge/preset-builder/forged-idea.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Muster Roll

## Why

Pain and vision. A GM who runs a game in Owlbear Rodeo has no simple way to keep the whole party, the NPCs and shared records such as an inventory in one room, for any game system. The simple sheet extension, dummy-sheet, stores each sheet in the player's browser. It has no room storage, no presets and no GM-owned sheets. Muster Roll gives one room GM-owned sheets that a preset defines. A preset is a list of sheets, each with its own schema: a Набор gives many sheets, such as player characters, and a Лист exists once, such as NPC, Инвентарь or История (`preset-format.md`). Version 1 is a POC without a server. It must prove that this model holds for a real session. During play, the GM and players open sheets to see current stats and inventory, and dice cells spare players from memorising the rules. Today a GM describes a sheet only by writing preset JSON, and nobody wants to. v2 adds a preset builder, so a GM builds a preset without JSON (`preset-builder.md`).

## Capabilities

- **CAP-1**
  - **intent:** The GM can edit every sheet and the preset.
  - **success:** A GM change to any value on any sheet stays after a reload.
- **CAP-2**
  - **intent:** Players see the sheets of every visible Набор and Лист and no sheet of a hidden one.
  - **success:** A player client shows every sheet of a visible Набор or Лист and shows no sheet of a hidden one.
- **CAP-3**
  - **intent:** The GM can turn write access on or off per player and per Набор sheet. Players edit a Лист only when the preset says `players: edit`.
  - **success:** With access on, the player's edit reaches all clients. Sheets without access stay read-only for that player. With access off, the edit does not apply. A player's edit of a Лист with `players: edit` reaches all clients, and an edit of any other Лист does not apply.
- **CAP-4**
  - **intent:** A JSON preset defines any number of Наборы and Листы, each with its own sections, for any game system (`preset-format.md`).
  - **success:** A preset for a second system with Инвентарь and Список заклинаний gives working sheets with no code change.
- **CAP-5**
  - **intent:** The preset controls sheet layout through aligned columns, inline flow and repeated blocks.
  - **success:** Rows in a `columns` section align in one grid. All rows of a `repeat` section form one block, and each sheet has its own number of blocks. Ids resolve inside the block first, then in the sheet.
- **CAP-6**
  - **intent:** Anyone who can see a sheet can roll its dice cells. Everyone who can see the sheet sees the result.
  - **success:** `1d20 <= str - 2*str_tired` with filled fields rolls once, and all connected clients show the same result with the roller's name. A roll from a hidden sheet shows only on GM clients.
- **CAP-7**
  - **intent:** A formula with bad input refuses to roll.
  - **success:** A formula with an empty, non-numeric or removed field shows an error. No roll and no broadcast occur.
- **CAP-8**
  - **intent:** The GM can change the preset by uploading a JSON file after sheets exist, and the change applies to all sheets.
  - **success:** A new field is empty on all sheets. A rename keeps the values. When an upload removes fields that hold values, or removes a Набор or Лист that holds sheets or values, one confirmation for the whole upload names how many values will be erased and how many sheets will be deleted. Both then go on all clients. Any other upload shows a short notice that the format changed.
- **CAP-9**
  - **intent:** Room data stays after a reload and after re-entry to the room.
  - **success:** A GM reload keeps all data. The snapshot is written when it fits. When it does not fit, it is skipped and the GM sees a notice. Room metadata never goes past the limit.
- **CAP-10**
  - **intent:** Players can read the last snapshot when no GM is online.
  - **success:** With no GM online and a snapshot present, a player sees the visible sheets from it. No live edit is exchanged.
- **CAP-11**
  - **intent:** Edits sync live between GM tabs, GM devices and players.
  - **success:** Edits to different rows from two GM tabs both stay. Two edits of one row settle on the latest version on all clients.
- **CAP-12**
  - **intent:** The GM can export and import the preset as a JSON file.
  - **success:** The file holds no values. Import into another room gives the same structure.
- **CAP-13**
  - **intent:** The GM can export and import a room snapshot as a JSON file.
  - **success:** The file holds values and token links. Import replaces all room data after confirmation. Values of field ids not in the current preset are dropped, and so are sheets of a Набор or Лист the preset lacks. The GM sees both counts. Import restores a token link where the token exists. Import resets player links and write rights to read.
- **CAP-14**
  - **intent:** A user can open a linked sheet from its token.
  - **success:** The sheet opens for those who can already see it. A link to a repeat block opens the sheet scrolled to that block. A hidden sheet opens only for the GM.
- **CAP-15**
  - **intent:** A player's edit waits for a GM client, and the player sees when none responds.
  - **success:** With no GM client responding, the player sees a "no connection to GM" status and the edit does not apply. When a GM client responds, the edit is sent again, confirmed and applied.
- **CAP-17**
  - **intent:** The GM can create and delete sheets of each Набор, and the field the preset names gives each sheet its tab name.
  - **success:** A new sheet shows on every client that can see it. An edit of the name field by anyone with write access renames the tab on every client. After one confirmation, a deleted sheet disappears with its values, token links, owner and write rights.
- **CAP-18**
  - **intent:** The GM can link a token to a sheet or to a repeat block where the preset sets `tokens`, and remove that link.
  - **success:** A linked token opens its sheet (CAP-14). A token links to one sheet or block, and a sheet or block can have many tokens. Removing a link keeps the sheet and the token. Deleting a block removes its links.
- **CAP-19**
  - **intent:** The GM can mark a player as the owner of a Набор sheet.
  - **success:** A sheet has at most one owner. The owner's client shows its own sheets first. Choosing an owner turns on write access for that player, and the GM can turn it off (CAP-3).
- **CAP-20** (v2)
  - **intent:** A GM can build a preset without writing JSON, on a separate page of the deployed site.
  - **success:** Starting blank, from a repository example or from a file, a GM makes a preset with its Наборы and Листы and downloads it with no JSON editing. A file that fails the preset checks does not open and shows the upload's message.
- **CAP-21** (v2)
  - **intent:** The room and the builder exchange a preset by file, and the extension settings open the builder.
  - **success:** A preset downloaded from the extension opens in the builder. A file downloaded from the builder uploads through CAP-8. The settings button opens the builder in a new tab.
- **CAP-22** (v2)
  - **intent:** The GM edits the preset through a structure tree and a form, beside a live preview.
  - **success:** A form edit redraws the preview at once, drawn by the extension's own sheet components. A click on a preview cell selects its item in the tree.
- **CAP-23** (v2)
  - **intent:** The builder covers the whole preset format.
  - **success:** Every Набор and Лист with its properties, section `title`, `width`, `columns`, `repeat` and `tokens`, every cell kind and `window` can each be set in the builder.
- **CAP-24** (v2)
  - **intent:** Every field has an id that the GM can see and rewrite, and formulas offer the ids as completions.
  - **success:** A new field gets an id from its label that follows the id rules and is unique in its scope. A label change keeps the id. The field form shows the id, and the GM can rewrite it to `str`.
- **CAP-25** (v2)
  - **intent:** Renaming a field id rewrites the formulas that refer to it.
  - **success:** Renaming `str` rewrites `str` by whole word in every formula that resolves to that field, leaves `str_tired` unchanged and says how many formulas changed. In a preset opened from a file, a changed id warns that the field's stored values in the room will be erased.
- **CAP-26** (v2)
  - **intent:** The builder keeps one draft by itself.
  - **success:** After the page is closed and opened again, the builder offers to continue the draft.
- **CAP-27** (v2)
  - **intent:** The GM can undo and redo every edit in the builder.
  - **success:** Each edit kind can be undone and then redone, and the preset returns to the same state each time.
- **CAP-28** (v2)
  - **intent:** The builder allows invalid states while editing and downloads only a valid preset.
  - **success:** Each error shows at its tree item and its preview cell, and a problem counter jumps to the first. Download is enabled only when `parsePresetFile` accepts the preset.
- **CAP-29**
  - **intent:** Each Лист exists exactly once in the room and shows as its own tab.
  - **success:** A preset with a Лист gives one tab with its title on every client that can see it. No command creates or deletes it, and its values stay across reloads and across uploads that keep it.
- **CAP-30**
  - **intent:** The GM can duplicate a repeat block, so that each token has its own block.
  - **success:** Nine copies of a block whose first field is "Скелет 1" give ten blocks with the same values and numbered first fields. An edit to one does not change the others. A copy has no token link.
- **CAP-31**
  - **intent:** The GM can clear all room data.
  - **success:** After one confirmation, the preset, every sheet, the room copy and the GM's local copy are gone on every client. This also works in a room whose data has an older format.

## Constraints

- No own server in v1. Live exchange needs a GM online. A hidden GM tab in Chrome stopped receiving edits after about 13 minutes, so a GM counts as online only when a GM client answers. A hidden tab that still answers counts as online, and a frozen one does not.
- Full data lives in the GM's browser. Room metadata holds only a compressed snapshot, and only when it fits.
- Room metadata is under 16kB in total and is shared with other extensions. The extension checks free space before it writes, because Owlbear reports success for a write past the limit and drops it.
- Broadcast messages are limited to 16KB.
- Formulas run through a small parser, never `eval`, because presets are shared files.
- Values are stored apart from the template, by field id.
- Every GM tab and device can edit.
- A player's edit takes effect only after a GM client checks the write right.
- A write right binds to the player id. A guest's id holds only in one browser. An account has one id across browsers.
- A room has one preset file. It holds at least one Набор or Лист, and all sheets follow it.
- No migration from format version 1. A v1 preset or snapshot file is refused with a message, and v1 room data is not read. "Очистить всё" (CAP-31) clears such a room.
- The interface matches the simplicity of dummy-sheet. Muster Roll takes no code or storage from it.
- The builder is a top-level page on the deployed site, outside the Owlbear iframe. The iframe's storage is partitioned from a top-level tab, so the extension and the builder exchange no data through storage.
- The builder's preview uses the extension's own sheet components. No second sheet renderer exists.
- The builder checks a preset with `parsePresetFile`, the upload's own check, and shows the upload's refusal messages.

## Non-goals

- Own server or Cloudflare storage in v1. v2 plans Cloudflare D1 with version-checked writes and a GM write key, which removes the 16kB limit and the dependence on one browser.
- Cloudflare KV in any version. Reads can lag 60 seconds or more, and writes are not atomic.
- dummy-sheet as a code or storage base. It stores each sheet in the player's browser.
- One editing GM tab.
- Sections per sheet, computed display fields and per-edit approval. Every sheet of a Набор follows one schema.
- Per-player write grants on a Лист. The preset decides with `players: edit`.
- Duplicating a whole Набор sheet. Only a repeat block is duplicated (CAP-30).
- Migration of v1 presets, snapshots and rooms.
- An in-extension preset editor and per-field confirmation of a preset upload. Presets are usually set before a game.
- Past the POC: request-and-confirm write access, + and − buttons as a property of number fields, token-linked stats, guest "open this character", sending rolls to the Dice extension.
- In the builder: in-place editing on the sheet, a text markup in place of JSON, hidden field ids, blocking of edits that make the preset invalid, and repair of a file that fails the preset checks.
- After v2: the settings button passes the room's preset to the builder in the URL fragment, and the builder writes to the room directly. Direct write waits for the v2 server.
- Merging two simultaneous edits of one row. Only the latest stays.
- Merging an imported snapshot into room data.
- Player edits while no GM client responds, in v1. A server in v2 changes this.
- Hiding hidden sheets from a modified client. Hidden sheets and their rolls are hidden in the interface only, and any client can read the room snapshot.
- Protection of the local copy before v2, other than the room snapshot and manual export.

## Success signal

- One real session runs with the party and NPCs kept only in the extension, and no data is lost.
- A preset for a second system, with Инвентарь and Список заклинаний as Листы, is built without code changes.
- v2: a GM builds a second-system preset in the builder without editing JSON, and the extension accepts the downloaded file on upload.

## Assumptions

- Players read the full visible sheets, not only names.
- "In the sheet" in id resolution means inside the same sheet, never across sheets.
- An unchecked check counts as 0 and is not an empty field.
- A `text` cell is fixed label text from the preset, with no id and no stored value.
- Write access to a sheet includes adding and removing its `repeat` blocks.
- Duplicating a repeat block is GM-only, like the retired NPC duplicate. Numbering applies to the block's first field when it is a `text` field with a value.
- An upload that drops `tokens` from a Набор, Лист or section, or removes the sheet or block, also removes its token links. Links are not counted in the confirmation.
- A Лист's tab name is its preset `title`.
- A joining client gets current data from an online GM client, otherwise from the last snapshot.
- The interface text is Russian in v1.
- The interface follows the live Owlbear theme, and no separate palette exists.
- The builder interface text is Russian, like the extension and the refusal messages it reuses.
- The changed-id warning compares ids with the file the builder opened. A preset started blank or from an example shows no such warning.

## Open Questions

- Can the Owlbear extension iframe open a new tab? The v2 settings button (CAP-21) depends on it, and the extension opens no tab today.
