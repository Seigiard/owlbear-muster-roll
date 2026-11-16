---
id: SPEC-muster-roll
companions:
  - preset-format.md
  - storage-and-sync.md
  - stack.md
  - preset-builder.md
  - builder-and-dev.md
  - ../../../docs/preset-format.md
  - ../../planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
  - ../../planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
sources:
  - ../../forge/muster-roll/forged-idea.md
  - ../../forge/preset-builder/forged-idea.md
  - ../../forge/sidebar-tabs-layout/forged-idea.md
  - ../../forge/one-dev-entry/forged-idea.md
  - ../../forge/uniform-preset-tree/forged-idea.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Muster Roll

## Why

Pain and vision. A GM who runs a game in Owlbear Rodeo has no simple way to keep the whole party, the NPCs and shared records such as an inventory in one room, for any game system. The simple sheet extension, dummy-sheet, stores each sheet in the player's browser. It has no room storage, no presets and no GM-owned sheets. Muster Roll gives one room GM-owned sheets that a preset defines. A preset is a list of templates: a sheet set gives any number of sheets, such as the party, and a single sheet exists once, such as a shared inventory or a story log (`preset-format.md`, `docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md`). Version 1 is a POC without a server. It must prove that this model holds for a real session. During play, the GM and players open sheets to see current stats and inventory, and dice cells spare players from memorising the rules. Today a GM describes a sheet only by writing preset JSON, and nobody wants to. v2 adds a preset builder, so a GM builds a preset without JSON (`preset-builder.md`). Format version 3 changes the window: a sidebar lists the sheets, and a sheet splits its sections into tabs, so a long sheet and a GM-only part of a visible sheet fit one window. The builder then becomes the one page for the developer and for every GM: it edits the preset and a snapshot together, shows the window as the GM and as a player sees it, and reads and writes the preset and snapshot files on disk. One dev command opens it. Format version 4 makes the preset tree regular, because every irregularity of version 3 (a set against a single sheet, a block named by its first field, a token flag tied to `repeat`, a row that is a bare array) was a special case in the builder and in the checks: every level is a node with one key vocabulary, `repeat` means the same thing on a template, a tab, a section and a row, a token is a cell, and a value record is one block with a version per cell.

## Capabilities

- **CAP-1**
  - **intent:** The GM can edit every sheet and the preset.
  - **success:** A GM change to any value on any sheet stays after a reload.
- **CAP-2**
  - **intent:** Players see the sheets of every visible template, and no sheet of a hidden template and no hidden tab, section or row.
  - **success:** A player client shows every sheet of a visible sheet set or single sheet, shows no sheet of a hidden one, and shows no hidden tab, section or row of a visible sheet.
- **CAP-3**
  - **intent:** The GM can turn write access on or off per player and per sheet of a sheet set. Players edit a player-editable template without that: a single sheet, or every sheet of a sheet set.
  - **success:** With access on, the player's edit reaches all clients. Sheets without access stay read-only for that player. With access off, the edit does not apply. A player's edit of a player-editable single sheet, or of any sheet of a player-editable sheet set, reaches all clients, and an edit of any other single sheet does not apply.
- **CAP-4**
  - **intent:** A JSON preset defines any number of sheet sets and single sheets, each with its own tabs, sections and rows, for any game system (`preset-format.md`).
  - **success:** A preset for a second system with Инвентарь and Список заклинаний gives working sheets with no code change.
- **CAP-5**
  - **intent:** The preset controls sheet layout through aligned columns, inline flow and repeat scopes on tabs, sections and rows, nested or not.
  - **success:** Rows in a `columns` section align in one grid. A repeat section's rows form one block, and a repeat row is a block of one row; each sheet has its own number of blocks. An id resolves inside the block first, then in each enclosing block, then in the sheet.
- **CAP-6**
  - **intent:** Anyone who can see a sheet can roll its dice cells. Everyone who can see the sheet sees the result.
  - **success:** `1d20 <= str - 2*str_tired` with filled fields rolls once, and all connected clients show the same result with the roller's name. A roll from a hidden sheet, tab, section or row shows only on GM clients.
- **CAP-7**
  - **intent:** A formula with bad input refuses to roll.
  - **success:** A formula with an empty, non-numeric or removed field shows an error. No roll and no broadcast occur.
- **CAP-8**
  - **intent:** The GM can change the preset by uploading a JSON file after sheets exist, and the change applies to all sheets.
  - **success:** A new field is empty on all sheets. A rename keeps the values. When an upload removes fields that hold values, removes a template that holds sheets or values, or removes a repeat scope that holds blocks, one confirmation for the whole upload names how many values will be erased and how many sheets will be deleted. Both then go on all clients. Any other upload shows a short notice that the format changed.
- **CAP-9**
  - **intent:** Room data stays after a reload and after re-entry to the room.
  - **success:** A GM reload keeps all data. The room copy is written when it fits. When it does not fit, it is skipped and the GM sees a notice. Room metadata never goes past the limit.
- **CAP-10**
  - **intent:** Players can read the last room copy when no GM is online.
  - **success:** With no GM online and a room copy present, a player sees the visible sheets from it. No live edit is exchanged.
- **CAP-11**
  - **intent:** Edits sync live between GM tabs, GM devices and players.
  - **success:** Edits to different fields of one sheet from two GM tabs both stay. Two edits of one field settle on the latest version on all clients.
- **CAP-12**
  - **intent:** The GM can export and import the preset as a JSON file.
  - **success:** The file holds no values. Import into another room gives the same structure.
- **CAP-13**
  - **intent:** The GM can export and import a snapshot of the room as a JSON file.
  - **success:** The file holds values and token links. Import replaces all room data after confirmation. Values of field ids not in the current preset are dropped, and so are blocks whose repeat scope the preset lacks and sheets of a template the preset lacks. The GM sees the counts. Import restores a token link where the token exists. Import resets player links and write rights to read.
- **CAP-14**
  - **intent:** A user can open a linked sheet from its token.
  - **success:** The sheet opens for those who can already see it, on the tab that holds the token cell, scrolled to that cell. A token cell on a hidden sheet, tab, section or row opens only for the GM.
- **CAP-15**
  - **intent:** A player's edit waits for a GM client, and the player sees when none responds.
  - **success:** With no GM client responding, the player sees a "no connection to GM" status and the edit does not apply. When a GM client responds, the edit is sent again, confirmed and applied.
- **CAP-17**
  - **intent:** The GM can create and delete sheets of each sheet set, and the set's `nameField` gives each sheet its name in the sidebar.
  - **success:** A new sheet shows on every client that can see it. An edit of the name field by anyone with write access renames the sheet's sidebar entry on every client. After one confirmation, a deleted sheet disappears with its values, token links, owner and write rights.
- **CAP-18**
  - **intent:** The GM can link a token to a token cell of a sheet, and remove that link.
  - **success:** A linked token opens its sheet at the cell (CAP-14). A token links to one token cell, and a token cell can have many tokens. A sheet can hold several token cells, inside and outside blocks. The offered token label is the name of the nearest ancestor that has one: the block's `nameField`, the section's `title`, the sheet's name or the template's `title`. On the sheet the GM sees the token cell as an icon with the link status and a menu that links, unlinks and selects the linked tokens on the map; a player sees nothing there. Removing a link keeps the sheet and the token. Deleting a block removes the links of its token cells.
- **CAP-19**
  - **intent:** The GM can mark a player as the owner of a sheet of a sheet set.
  - **success:** A sheet has at most one owner. The owner's client shows its own sheets first. Choosing an owner turns on write access for that player, and the GM can turn it off (CAP-3).
- **CAP-20** (v2)
  - **intent:** A GM can build a preset without writing JSON, on a separate page of the deployed site.
  - **success:** Starting blank, from a repository example or from a file, a GM makes a preset with its sheet sets and single sheets and downloads it with no JSON editing. A file that fails the preset checks does not open and shows the upload's message.
- **CAP-21** (v2)
  - **intent:** The room and the builder exchange the preset and the snapshot by file, and the extension settings open the builder.
  - **success:** A preset and a snapshot downloaded from the extension open in the builder. A preset file from the builder uploads through CAP-8, and a snapshot file imports through CAP-13. The settings button opens the builder in a new tab.
- **CAP-22** (v2)
  - **intent:** The GM edits the preset through a structure tree and a form, beside a live preview.
  - **success:** A form edit redraws the preview at once, drawn by the extension's own sheet components. The first click on a preview cell selects its item in the tree. A second click or Enter types a value into the snapshot (CAP-36), and Esc leaves typing. A dice cell rolls on the second click.
- **CAP-23** (v2)
  - **intent:** The builder covers the whole preset format.
  - **success:** Every template with its properties, `repeat` with its `id` and `nameField` on a template, tab, section and row, `title` and `visibility` on a tab, section and row, section `width` and `columns`, every cell kind with the token cell, and `window` can each be set in the builder.
- **CAP-24** (v2)
  - **intent:** Every field has an id that the GM can see and rewrite, and formulas offer the ids as completions.
  - **success:** A new field gets an id from its label that follows the id rules and is unique in its scope. A label change keeps the id. The field form shows the id, and the GM can rewrite it to `str`.
- **CAP-25** (v2)
  - **intent:** Renaming a field id rewrites the formulas that refer to it.
  - **success:** Renaming `str` rewrites `str` by whole word in every formula that resolves to that field, leaves `str_tired` unchanged and says how many formulas changed. In a preset opened from a file, a changed id warns that the field's stored values in the room will be erased.
- **CAP-26** (v2)
  - **intent:** The builder keeps one draft by itself.
  - **success:** After the page is closed and opened again, the builder opens straight into the editor on the draft, with no prompt. The draft holds the preset and the snapshot while no file is attached. With no draft it opens on an empty preset.
- **CAP-27** (v2)
  - **intent:** The GM can undo and redo every edit in the builder.
  - **success:** Each edit kind can be undone and then redone, and the preset returns to the same state each time.
- **CAP-28** (v2)
  - **intent:** The builder allows invalid states while editing and downloads only a valid preset.
  - **success:** Each error shows at its tree item and its preview cell, and a problem counter jumps to the first. Download is enabled only when `parsePresetFile` accepts the preset.
- **CAP-29**
  - **intent:** Each single sheet exists exactly once in the room and shows as its own sidebar entry.
  - **success:** A preset with a single sheet gives one sidebar entry with its title on every client that can see it. No command creates or deletes it, and its values stay across reloads and across uploads that keep it.
- **CAP-30**
  - **intent:** The GM can duplicate a block, so that each token has its own block.
  - **success:** Nine duplicates of a block whose `nameField` holds "Скелет 1" give ten blocks with the same values, the same nested blocks and numbered names. An edit to one does not change the others. A duplicate and its nested blocks have no token link.
- **CAP-31**
  - **intent:** The GM can wipe all room data.
  - **success:** After one confirmation, the preset, every sheet, the room copy and the GM's local copy are gone on every client. This also works in a room whose data has an older format.
- **CAP-32**
  - **intent:** Token selection follows the token link both ways: a token selected on the map marks its sheet or block in the window, and a GM selects the linked tokens of a sheet or block from the window.
  - **success:** A selected linked token marks the sidebar entry of its sheet and, for a token cell inside a block, that block and the tab that holds it, and the window does not switch sheet or tab. Several selected tokens mark every target, and a cleared selection clears the marks. A GM selects all linked tokens of a sheet or block on the open scene with one action, and the same action deselects them. Players see marks for their own selection on sheets they can see and do not select from the window.
- **CAP-33** (v3)
  - **intent:** The window navigates between sheets through a sidebar, where each sheet set is a titled group of its sheets.
  - **success:** A preset with two sheet sets and two single sheets gives a sidebar of two groups, each a heading with the set's title, its sheets and its "+", each followed by a divider, then two plain entries, with settings at the bottom. A 480 px window shows the sheet beside the sidebar. A long sheet name is cut short and shows in full in a tooltip.
- **CAP-34** (v3)
  - **intent:** A template splits its sections into tabs, and a sheet shows one tab at a time (`preset-format.md`).
  - **success:** A template with tabs «Основное» and «Снаряжение» shows a row of both, and each shows its own sections. A template with one tab shows no tab row. A formula on one tab rolls with a field from another tab.
- **CAP-35** (v3)
  - **intent:** A preset can hide a tab, a section or a row from players.
  - **success:** On a visible sheet with a hidden tab «Заметки мастера» and a hidden row «Заметки» in a visible section, the GM sees both and a player sees neither. A roll from either shows only on GM clients, and players get no token menu on their token cells. A visible template whose every tab is hidden is accepted, and players see its sheets with no tab.
- **CAP-36**
  - **intent:** The builder edits a snapshot beside the preset: its preview is the extension window with the snapshot's sheets.
  - **success:** With a preset and a snapshot of two characters, the window sidebar lists both sheets and the set's "+ Добавить". A value typed into a sheet lands in the snapshot, and the snapshot imports into a room through CAP-13 with the same values. A sheet set with no sheets shows a pale "Образец" whose cells still select tree items. When a preset change leaves a value no place, the value drops with no warning.
- **CAP-37**
  - **intent:** The builder preview switches between the GM's and a player's view of the same window.
  - **success:** With "Игрок" chosen, GM-only sheet sets, single sheets, tabs, sections and rows disappear, and every sheet reads only except the sheets of a player-editable template. "Мастер" shows everything again. Both views draw the same records.
- **CAP-38**
  - **intent:** The builder reads and writes an attached preset file and snapshot file (`builder-and-dev.md`).
  - **success:** In Chromium, a save of the attached file on disk redraws the preview with no reload, and an edit in the page is written to the file. When both changed, a prompt offers «Взять из файла» or «Оставить мои». A reload opens the draft and reattaches no file. In Safari and Firefox the builder opens a file and downloads, and neither writes nor follows it.
- **CAP-39**
  - **intent:** A file block per file in the builder's top bar shows its state and holds every file action (`builder-and-dev.md`).
  - **success:** The block shows the file name and its status. Its menu shows the full path and the last sync time, and opens another file, saves as, downloads a copy, detaches and clears. Detach keeps the content as a draft and stops writing. Clear, after a confirmation that names the file, empties the page and the linked file, and undo restores both.
- **CAP-40**
  - **intent:** A developer opens the builder with one command, and a live Owlbear room with one other (`builder-and-dev.md`).
  - **success:** `bun run dev` opens the builder on `localhost` with no Owlbear and no tunnel. `bun run dev:owlbear` serves the Owlbear adapter through a tunnel and prints the `manifest.json` URL to add.
- **CAP-41** (v4)
  - **intent:** A repeat tab shows one tab per block, and the GM adds and removes blocks there.
  - **success:** A single sheet «НПС» with a repeat tab «Персонаж» whose `nameField` is `npc_name` shows one tab per NPC, titled by its name, and for the GM a "+" tab last. The "+" tab adds an empty NPC and opens it. A delete inside the tab removes that NPC with its values, nested blocks and token links. A player sees the NPC tabs and no "+".
- **CAP-42** (v4)
  - **intent:** A repeat scope inside a repeat block gives each block its own nested blocks.
  - **success:** A repeat section «Атаки» inside the repeat tab «Персонаж» gives each NPC its own attacks. A formula in an attack reads `hp` of its NPC and a field of the sheet. A duplicate of the NPC copies its attacks (CAP-30).

## Constraints

- No own server in v1. Live exchange needs a GM online. A hidden GM tab in Chrome stopped receiving edits after about 13 minutes, so a GM counts as online only when a GM client answers. A hidden tab that still answers counts as online, and a frozen one does not.
- Full data lives in the GM's browser. Room metadata holds only the room copy, compressed, and only when it fits.
- Room metadata is under 16kB in total and is shared with other extensions. The extension checks free space before it writes, because Owlbear reports success for a write past the limit and drops it.
- Broadcast messages are limited to 16KB.
- Formulas run through a small parser, never `eval`, because presets are shared files.
- Values are stored apart from the template, by field id, in one record per block with a version per cell (`storage-and-sync.md`). Merge is per cell. The per-field record is the fallback if per-cell merge proves awkward.
- Every GM tab and device can edit.
- A player's edit takes effect only after a GM client checks the write right.
- A write right binds to the player id. A guest's id holds only in one browser. An account has one id across browsers.
- A room has one preset file. It holds at least one template, and all sheets follow it.
- Format version 4. The tree has a fixed depth, `template → tab → section → row → cell`, and each container holds one kind of child. No migration from versions 1 to 3: such a preset or snapshot file is refused with a message, and such room data is not read. A wipe («Очистить всё», CAP-31) clears such a room.
- `repeat` is an object that carries the scope's `id` and `nameField`; no key of the schema depends on another key. Rule checks outside the schema: unique ids per scope, `nameField` names a `text` field inside its scope, formula ids, row width against `columns`.
- An id exists only where something refers to the node: template, field, token cell, repeat scope. A changed id is a new thing.
- The interface matches the simplicity of dummy-sheet. Muster Roll takes no code or storage from it.
- The builder is a top-level page on the deployed site, outside the Owlbear iframe. The iframe's storage is partitioned from a top-level tab, so the extension and the builder exchange no data through storage.
- The builder's preview uses the extension's own sheet components. No second sheet renderer exists.
- The extension and the builder preview draw the window, with its sidebar and tabs, through one frame component.
- The builder preview runs no engine and no mock adapter. The player view filters the same records through `src/core/visibility.ts`.
- File write and follow need the File System Access API. Without it the builder opens and downloads only.
- The window is at least 480 px wide, so the sidebar and a sheet fit side by side. The sidebar is always shown, 10 rem wide.
- An id resolves in its block, then in each enclosing block, then in the sheet. Fields outside every repeat scope of a template are one id scope across all its tabs.
- Visibility only narrows: a node is hidden when it or any ancestor is hidden.
- The builder checks a preset with `parsePresetFile`, the upload's own check, and shows the upload's refusal messages.

## Non-goals

- Own server or Cloudflare storage in v1. v2 plans Cloudflare D1 with version-checked writes and a GM write key, which removes the 16kB limit and the dependence on one browser.
- Cloudflare KV in any version. Reads can lag 60 seconds or more, and writes are not atomic.
- dummy-sheet as a code or storage base. It stores each sheet in the player's browser.
- One editing GM tab.
- Sections per sheet, computed display fields and per-edit approval. Every sheet of a sheet set follows one schema.
- Per-player write access on a single sheet. The preset makes a template player-editable or not (`players: edit`).
- Duplicating a whole sheet of a sheet set. Only a block is duplicated (CAP-30).
- Migration of v1, v2 and v3 presets, snapshots and rooms.
- Hiding one sheet of a sheet set. GM-only is set in the preset, per template, tab, section and row.
- A preset check against a visible template whose every tab is hidden, or against a hidden row inside a `columns` grid.
- Generating the builder's forms or tree from the preset schema. Its real exceptions (values drawn from other data, edits with side effects, formula and option inputs) stay hand-written.
- Rows directly in a tab, or cells directly in a section. Ids on tabs and on plain sections and rows. A name-field property on the token cell. A token flag on a field. A limit on repeat nesting depth.
- Collapsing the sidebar, and a JSON Schema export of the preset format.
- An in-extension preset editor and per-field confirmation of a preset upload. Presets are usually set before a game.
- Past the POC: request-and-confirm write access, + and − buttons as a property of number fields, token-linked stats, guest "open this sheet".
- In the builder: in-place editing of structure on the sheet (values are typed in place, CAP-36), a text markup in place of JSON, hidden field ids, blocking of edits that make the preset invalid, and repair of a file that fails the preset checks.
- After v2: the settings button passes the room's preset to the builder in the URL fragment, and the builder writes to the room directly. Direct write waits for the v2 server.
- Merging two simultaneous edits of one cell. Only the latest stays.
- A live mock room (engine, two clients) in the builder. Sync is tested by e2e tests.
- A player view per player in the builder: a snapshot holds no owners or write rights.
- A guard or a count for values a preset change drops in the builder.
- Writing or following files in browsers without the File System Access API.
- Merging an imported snapshot into room data.
- Player edits while no GM client responds, in v1. A server in v2 changes this.
- Hiding hidden sheets from a modified client. Hidden sheets and their rolls are hidden in the interface only, and any client can read the room copy.
- Protection of the local copy before v2, other than the room copy and manual export.

## Success signal

- One real session runs with the party and NPCs kept only in the extension, and no data is lost.
- A preset for a second system, with a shared inventory and a spell list as single sheets, is built without code changes.
- v2: a GM builds a second-system preset in the builder without editing JSON, and the extension accepts the downloaded file on upload.
- A developer runs `bun run dev`, attaches `presets/cairn-2e.json` and a snapshot, edits the preset in a text editor and sees the change in the builder, fills a character in the builder and finds it in the snapshot file, and checks both the GM and the player view, with no other page.
- v4: a GM builds an NPC sheet whose NPCs are tabs, each with its own attack list and a token cell, links tokens to two NPCs, and a player and the GM edit different fields of one character in the same moment with no edit lost.

## Assumptions

- Players read the full visible sheets, not only names.
- "In the sheet" in id resolution means inside the same sheet, never across sheets.
- An unchecked check counts as 0 and is not an empty field.
- A label (a `text` cell in the file) is fixed text from the preset, with no id and no stored value.
- Write access to a sheet includes adding and removing its blocks, on every repeat scope of the sheet.
- Duplicating a block is GM-only, like the retired NPC duplicate. Numbering applies to the block's `nameField` when it is a `text` field with a value.
- An upload that removes a token cell, a block or a sheet also removes its token links. Links are not counted in the confirmation.
- A single sheet's sidebar entry is its preset `title`.
- A player's edit of a field on a hidden tab, section or row is refused by the GM client's access check, as for a hidden template.
- A sheet opens on its first tab the role can see. The chosen tab is local to the client and is not stored in the room.
- A sheet set's `nameField` may sit on any tab, a hidden one included. The sheet's name still shows in the sidebar. On a hidden tab it is read-only for players (owner's decision).
- A visible dice cell whose formula names a field on a hidden tab shows that value in the roll. Hiding is in the interface only.
- A joining client gets current data from an online GM client, otherwise from the last room copy.
- The interface text is Russian in v1.
- The interface follows the live Owlbear theme, and no separate palette exists.
- The builder interface text is Russian, like the extension and the refusal messages it reuses.
- Selecting from the window adds to the map selection. A linked token that is not on the open scene is skipped with no error, and the action shows only while at least one linked token is on the open scene.
- The changed-id warning compares ids with the file the builder opened. A preset started blank or from an example shows no such warning.
- The builder writes a preset to its file only while `parsePresetFile` accepts it. With problems the file block says the file is not saved, and writing resumes when they are fixed, so the file always uploads (CAP-28).
- A followed file that fails the checks on disk does not replace the page. The file block shows the refusal message, and the page keeps the last good content.
- The builder's player view reads every sheet of a sheet set only: a snapshot holds no owners or write rights.
- A sheet's root record is the block record of the sheet; a sheet of a sheet set carries its set and order there, and a single sheet's id is its template id.
- A link record names the sheet, the block path and the token cell. The exact shape is the architecture's.
- A repeat tab's "+" is the last tab in the row. Deleting a block tab is GM-only, like its "+", and sits inside the tab.
- A token cell on a hidden tab, section or row gives players no token menu, by the visibility rule.
- Snapshot import drops blocks whose repeat scope the current preset lacks and counts them with the dropped values.
- An owner (CAP-19) can still be set on a player-editable sheet set; it changes nothing for write access there.

## Open Questions

- Can the Owlbear extension iframe open a new tab? The v2 settings button (CAP-21) depends on it, and the extension opens no tab today.
