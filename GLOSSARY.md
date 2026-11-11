# Muster Roll

An Owlbear Rodeo extension that keeps the party and the NPCs of one room on sheets the GM owns. A preset defines the sheets, so the extension works for any game system.

## People

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
A GM who is in the room and whose extension answers right now. A GM who is in the room but whose tab sleeps is not online.
_Avoid_: present GM, active GM

## Presets

**Preset**:
The file that sets the structure of every sheet in a room: one character template and one NPC template. It holds no values. A room has one preset at a time.
_Avoid_: template file, schema, config, system

**Template**:
The structure of one sheet kind inside a preset: the character template or the NPC template.
_Avoid_: layout, form, blank

**Section**:
A titled block of a template that holds rows.
_Avoid_: group, panel, block

**Repeat section**:
A section whose one template row each sheet may hold any number of times, such as attacks or inventory items.
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
The name of a field. Values are kept under it, and formulas refer to the field by it. A label change keeps it, and an id change loses the field's stored values.
_Avoid_: key, name, variable

**Scope**:
The set of fields a field id must be unique in and a formula can see. The fields outside repeat sections of one template form one scope. Each repeat section's row forms a scope of its own.
_Avoid_: namespace, context

**Dice cell**:
A cell that rolls its formula when pressed. It holds no value.
_Avoid_: dice button, roll cell, macro

**Formula**:
The dice expression of a dice cell, such as `1d20 <= str - 2*str_tired`. It refers to fields by field id.
_Avoid_: macro, script, expression

## Sheets

**Sheet**:
The values of one character or one NPC under a name, laid out by its template.
_Avoid_: card, record, profile

**Character**:
A sheet every player can read. Hirelings and pets are characters too.
_Avoid_: PC, hero, player character

**NPC**:
A sheet that only GMs can see.
_Avoid_: monster, enemy, mob

**Value**:
What one field holds on one sheet.
_Avoid_: data, stat

**Repeat row**:
One row of a repeat section on one sheet. Each sheet has its own number of repeat rows.
_Avoid_: instance, item, entry

**Owner**:
The one player marked as a character's owner. The owner sees that character first, and gets write access to it when marked.
_Avoid_: controller, assignee

**Write access**:
A player's right to edit one character, granted per player and per character. A GM always has it.
_Avoid_: permission, ACL, edit right

**Pending edit**:
A player's edit that waits for an online GM to check write access. It applies only after that check.
_Avoid_: draft edit, unsaved change, queued edit

**Token link**:
The bond between an Owlbear token and a sheet, so the token opens the sheet. A token links to one sheet, and a sheet can have many tokens.
_Avoid_: binding, attachment, token sheet

## Rolls

**Roll**:
The result of one press of a dice cell, with the roller's name. A roll from a character sheet shows to everyone in the room. A roll from an NPC sheet shows only to GMs.
_Avoid_: throw, dice result

**Dice extension**:
Another Owlbear extension that draws 3D dice, such as Dice+ or Dicex. When one is in the room and a GM allows it, a roll uses its dice.
_Avoid_: dice tray, dice roller

## Keeping room data

**Room copy**:
The compressed copy of a room's sheets, values and links that the room itself keeps, so players can read characters with no GM online. It is written only when it fits.
_Avoid_: backup, cache, room snapshot

**Snapshot**:
A file that holds all of a room's sheets, values and token links. A GM downloads it and can load it into a room, which replaces all of that room's data.
_Avoid_: export, backup, save file

**Preset change**:
A GM's upload of a new preset to a room that already has sheets. A new field starts empty, and a removed field's values are erased after one confirmation.
_Avoid_: migration, preset update

## Builder

**Builder**:
A separate page of the deployed site where a GM makes or changes a preset without writing JSON, then downloads it.
_Avoid_: editor, configurator, constructor, designer

**Preview**:
A sheet drawn from a preset that is not in a room, with sample or empty values, so a GM sees the preset as the extension draws it.
_Avoid_: mockup, render

**Draft**:
The one unfinished preset the builder keeps by itself until the GM downloads it.
_Avoid_: autosave, work in progress
