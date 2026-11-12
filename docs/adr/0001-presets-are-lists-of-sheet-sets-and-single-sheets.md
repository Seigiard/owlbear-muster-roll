---
status: accepted
---

# Presets are lists of sheet sets and single sheets

A preset used to hold exactly two templates, character and NPC, and the code treated them differently: NPCs were GM-only, had their own tab, could be duplicated per sheet and linked to tokens per sheet. We replaced that with a list of templates of two kinds: a sheet set, which GMs create any number of sheets from, and a single sheet, which exists once in the room. Visibility, player editing of a single sheet and token linking are template properties, so no template is special in code. A real game needs more than party and NPCs, such as a shared inventory, a story log or a spell list, and the owner wanted the preset author, not the code, to decide what each one is and who sees it.

## Considered Options

- **Keep character and NPC, add more single sheets beside them.** Rejected: NPC would stay a hard-coded case while every other sheet follows properties.
- **NPC as a sheet set shown on one tab.** Rejected: it needs a display mode only NPCs use. NPCs are repeat blocks of a single sheet instead, and token links and duplicates work on repeat blocks.
- **NPC as a sheet set with a tab per NPC.** Rejected: ten skeletons would make ten tabs.

## Consequences

- An NPC is a repeat block, so a repeat section may hold several rows, and a token can link to one repeat block.
- Duplicating a whole sheet is gone. Duplicate copies a repeat block.
- The format moves to version 2 with no migration. Version 1 presets, snapshots and room copies are refused, and GMs start over with the «Очистить всё» action. This was accepted because only the owner's test rooms held version 1 data. A rollback cannot cross this version.
- Version 3 (TASK-58) puts the sections of each template into a required list of tabs, again with no migration. Version 1 and 2 presets, snapshots and room copies are refused the same way, and stored keys move from `mr2` to `mr3`. A rollback cannot cross this version either.
- Per-player write access and owners stay on sheets of a sheet set. A single sheet is player-editable or read-only for players.
