# Muster Roll

An Owlbear Rodeo extension that keeps the sheets of one room, such as the party, the NPCs and a shared inventory, under the GMs' control. A preset defines the sheets, so the extension works for any game system.

## Room and people

**Room**:
One Owlbear Rodeo room. Every preset, sheet, link and right belongs to exactly one room.
_Avoid_: game, table, session (a session is one evening of play in a room)

**GM**:
A participant whose Owlbear role is GM. A room can have several GMs, and each one can edit everything.
_Avoid_: DM, master, admin

**Player**:
A participant who is not a GM.
_Avoid_: user, member

**Guest**:
A player without an Owlbear account. A guest's identity holds only in one browser, so their rights do not follow them to another browser.
_Avoid_: anonymous player

**Online GM**:
A GM who is in the room and whose client answers right now. A hidden tab that still answers is online.
_Avoid_: present GM, active GM

## Presets

**Preset**:
The file that sets the structure of every sheet in a room as a list of templates. It holds no values. A room has one preset at a time.
_Avoid_: template file, schema, config, system

**Template**:
One entry of a preset: a sheet set or a single sheet, with its title and its sections.
_Avoid_: layout, form, blank, sheet kind

**Sheet set**:
A template that GMs create any number of sheets from, such as the party. In the interface: «Набор».
_Avoid_: character template, character sheets, collection, many

**Single sheet**:
A template that is exactly one sheet in the room, such as NPCs, a shared inventory or a spell list. In the interface: «Одиночный лист».
_Avoid_: Лист (alone), page, one, global sheet

**Name field**:
The field of a sheet set whose value names each of its sheets on its tab, in token labels and in rolls.
_Avoid_: title field, tab field, sheet name

**Visibility**:
Whether players can see the sheets of a template, or only GMs. A hidden sheet is hidden in the interface only.
_Avoid_: privacy, access, GM-only flag

**Player-editable**:
A single sheet that every player may edit, with no write access granted per player.
_Avoid_: shared, public, open sheet

**Linkable**:
A sheet set, single sheet or repeat section whose sheets or repeat blocks tokens may link to.
_Avoid_: token-enabled, bindable

**Section**:
A titled block of a template that holds rows.
_Avoid_: group, panel, block

**Repeat section**:
A section whose rows form one block that each sheet may hold any number of times, such as attacks, inventory items or NPCs. It has at least one row with a field.
_Avoid_: list section, table, array

**Row**:
One line of cells in a section.
_Avoid_: line, entry

**Cell**:
One slot in a row: a label, a field or a dice cell.
_Avoid_: element, widget, control

**Label**:
A cell with fixed text from the preset. It holds no value.
_Avoid_: text cell, caption, static text

**Field**:
A cell that holds a value on each sheet: text, a number, or a check.
_Avoid_: input, stat, attribute, property

**Field id**:
The name of a field. Values are kept under it, and formulas refer to the field by it.
_Avoid_: key, name, variable

**Scope**:
The set of fields a field id must be unique in. The fields outside repeat sections of one template form one scope, and the rows of each repeat section form a scope of their own. A formula in a repeat section sees its own scope first, then the outer one.
_Avoid_: namespace, context

**Dice cell**:
A cell that rolls its formula when pressed. It holds no value.
_Avoid_: dice button, roll cell, macro

**Formula**:
The dice expression of a dice cell, such as `1d20 <= str - 2*str_tired`. It refers to fields by field id.
_Avoid_: macro, script, expression

## Sheets

**Sheet**:
The values of one sheet in a room, laid out by its template: one of a sheet set's sheets, or a single sheet. In the interface: «лист».
_Avoid_: card, record, profile, character (a character or an NPC is preset content, not a kind of sheet)

**Value**:
What one field holds on one sheet.
_Avoid_: data, stat

**Repeat block**:
One copy of a repeat section's rows on one sheet, such as one NPC. Each sheet has its own number of repeat blocks.
_Avoid_: repeat row, instance, item, entry

**Duplicate**:
A new repeat block that copies the values of another one. In the interface: «Дубль», made by the «Дублировать…» command.
_Avoid_: clone, copy (alone)

**Owner**:
The one player marked as the owner of a sheet of a sheet set. The owner sees that sheet first, and gets write access to it when marked.
_Avoid_: controller, assignee

**Write access**:
A player's right to edit one sheet of a sheet set, granted per player and per sheet. A GM always has it. A single sheet has no per-player write access: it is player-editable or not.
_Avoid_: permission, ACL, edit right

**Pending edit**:
A player's edit that waits for an online GM to check write access. It applies only after that check.
_Avoid_: draft edit, unsaved change, queued edit

**Token link**:
The bond between an Owlbear token and a sheet or a repeat block of a linkable template, so the token opens it. A token links to one sheet or repeat block, and each of those can have many tokens.
_Avoid_: binding, attachment, token sheet

## Rolls

**Roll**:
The result of one press of a dice cell, with the roller's name. A roll from a sheet players can see shows to everyone in the room. A roll from a hidden sheet shows only to GMs.
_Avoid_: throw, dice result

**Dice extension**:
Another Owlbear extension that draws 3D dice, such as Dice+ or Dicex.
_Avoid_: dice tray, dice roller

## Keeping room data

**Room copy**:
The compressed copy of a room's sheets, values and links that the room itself keeps, so players can read sheets with no GM online.
_Avoid_: backup, cache, room snapshot

**Snapshot**:
A file that holds all of a room's sheets, values and token links. A GM downloads it and can load it into a room, which replaces all of that room's data.
_Avoid_: export, backup, save file

**Preset change**:
A GM's upload of a new preset to a room that already has sheets.
_Avoid_: migration, preset update

**Wipe**:
A GM's erasure of all of a room's data: sheets, values, links, rights and the room copy. In the interface: «Очистить всё».
_Avoid_: reset, clear, purge

## Builder

**Builder**:
A separate page of the deployed site where a GM makes or changes a preset without writing JSON, then downloads it.
_Avoid_: editor, configurator, constructor, designer

**Preview**:
A sheet drawn from a preset that is not in a room, with sample or empty values, so a GM sees the preset as the extension draws it.
_Avoid_: mockup, render

**Draft**:
The one unfinished preset the builder keeps by itself and offers to continue on the next visit.
_Avoid_: autosave, work in progress
