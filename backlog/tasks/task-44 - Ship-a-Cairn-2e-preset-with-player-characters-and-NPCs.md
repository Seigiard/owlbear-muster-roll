---
id: TASK-44
title: Ship a Cairn 2e preset with player characters and NPCs
status: To Do
assignee: []
created_date: '2026-11-11T22:36:00Z'
updated_date: '2026-11-11T22:36:00Z'
labels: []
dependencies:
  - TASK-41
references:
  - https://cairnrpg.com/second-edition/
priority: low
type: feature
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner runs Cairn 2e and wants a ready preset instead of writing one. It is also the first real preset on the v2 model from ADR 0001, so it tests that sheet sets, single sheets and linkable repeat sections are enough for a real game. Cairn 2e is published under CC-BY-SA 4.0; the game SRD at the reference link is the source for the stat list and the roll rules. Check it rather than relying on memory. Where to look: GitHub has many Cairn character sheet projects, and the official sheet exists too; they show the usual stat set and layout. Projects without a license give ideas only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A file in `presets/` passes `parsePresetFile` and is listed in `presets/README.md`
- [ ] #2 A sheet set for player characters, with the character name as its name field, holds the Cairn 2e character stats from the SRD: STR, DEX and WIL with their maximum and current values, HP with its maximum, Armor, the inventory slots with Fatigue and the deprived state, coins, and the background and description fields
- [ ] #3 Each attribute has a dice cell for a save: d20 roll-under the current value, per the SRD
- [ ] #4 An NPC single sheet holds a linkable repeat section; each repeat block is one NPC with the Cairn 2e stat block: name, HP, Armor, STR, DEX, WIL, attacks with damage dice, and notes. NPC sheets are visible to GMs only
- [ ] #5 Every attack in both templates has a dice cell for its damage formula
- [ ] #6 A parse test covers the preset file, and the owner opens it in a live room
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-11T22:36:00Z

---

Owner: search the web first; GitHub has many Cairn character sheet projects to learn the stat set and layout from.

---
<!-- COMMENTS:END -->
