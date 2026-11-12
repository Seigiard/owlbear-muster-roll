---
id: TASK-44
title: Ship a Cairn 2e preset with player characters and NPCs
status: Done
assignee:
  - '@claude'
created_date: '2026-11-11T22:36:00Z'
updated_date: '2026-11-12T02:26:00Z'
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
- [x] #1 A file in `presets/` passes `parsePresetFile` and is listed in `presets/README.md`
- [x] #2 A sheet set for player characters, with the character name as its name field, holds the Cairn 2e character stats from the SRD: STR, DEX and WIL with their maximum and current values, HP with its maximum, Armor, the inventory slots with Fatigue and the deprived state, coins, and the background and description fields
- [x] #3 Each attribute has a dice cell for a save: d20 roll-under the current value, per the SRD
- [x] #4 An NPC single sheet holds a linkable repeat section; each repeat block is one NPC with the Cairn 2e stat block: name, HP, Armor, STR, DEX, WIL, attacks with damage dice, and notes. NPC sheets are visible to GMs only
- [x] #5 Every attack in both templates has a dice cell for its damage formula
- [x] #6 A parse test covers the preset file, and the owner opens it in a live room
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research the Cairn 2e SRD and public sheets (official Foundry system, community sheets) for the stat set and layout.
2. Write presets/cairn-2e.json on format v2: a 'pc' sheet set (nameField name) and a GM-only 'npc' single sheet whose linkable repeat section holds one NPC per repeat block.
3. Add a bun:test parse test over presets/*.json in src/core/preset.test.ts; list the file in presets/README.md.
4. Check the layout in the preview with sample and empty values; fix what looks wrong.
5. Run the full check; commit on the branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (2026-11-12):
- Cairn 2e SRD, CC-BY-SA 4.0: https://cairnrpg.com/second-edition/players-guide/character-creation/ (3d6 STR/DEX/WIL, swap two; 1d6 HP; age 2d20+10; background; traits Physique, Skin, Hair, Face, Speech, Clothing, Virtue, Vice; bonds; omens; 10 inventory slots, backpack holds 6 slots of items or Fatigue; bulky = 2 slots; petty coins under 100gp take no slot), https://cairnrpg.com/second-edition/players-guide/core-rules/ (save = d20 equal or under the attribute, 1 always succeeds, 20 always fails; Armor max 3; Fatigue takes one slot; Deprived blocks recovery; attacks auto-hit, weapon die minus armor; impaired d4, enhanced d12; critical damage = STR save), https://cairnrpg.com/second-edition/players-guide/marketplace/ (armor 1-3; weapons d6/d8/d10), https://cairnrpg.com/second-edition/wardens-guide/creating-monsters/ (stat block: 'X HP, X Armor, X STR, X DEX, X WIL, Attack (dX, qualities)', then description, quirk, Critical Damage effect).
- Official sheet: fillable PDFs in the Player's Guide on itch.io (https://yochaigal.itch.io/cairn-players-guide); layout not readable from the web.
- yochaigal/Cairn-FoundryVTT (MIT, the author's Foundry system, https://github.com/yochaigal/Cairn-FoundryVTT): character = name, background, HP value/max, gold, STR/DEX/WIL value/max with a d20cs<=value save on each, Armor, Deprived check, items list with Fatigue, description, notes. NPC = same plus role and slots.
- Ideas only (no license): bonkposting/fari-template-cairn (1e: Hands, Body, Backpack inventory; Gp/Sp/Cp), cuceGenco/cairnRPG2etool, community itch.io sheets. No content copied.
- Chosen stat set: STR/DEX/WIL current + max with a save each, HP current + max, Armor, Deprived, coins (gp), age, background, 8 traits, bond, omen, scars, notes; inventory = slots 1-4 (hands and body) and 5-10 (backpack), each a text field plus a Fatigue check; weapons as a repeat section. NPC repeat block = name, HP/max, Armor, STR/DEX/WIL with saves, two attacks, Critical Damage, notes. Labels Russian, stat names in English abbreviations, as in the brief.
- Format gaps (not changed): (1) a dice cell cannot take its die size from a field, so each attack row shows d4, d6, d8, d10 and d12 and the player presses the weapon's die (d4 impaired, d12 enhanced). (2) A dice cell's label comes only from a fixed text cell, so a damage roll reads '1d8', not the weapon name. (3) '1 always succeeds, 20 always fails' is not expressible; with attributes 1-19 the plain roll-under gives the same result. (4) An NPC repeat block cannot hold a nested list, so it has two fixed attack rows. (5) Slot use and bulky items are not counted; the player writes a bulky item into two slots.

Verification (2026-11-12), commit 012f8ed on the agent branch:
- AC1: presets/cairn-2e.json parses: 'the shipped presets > cairn-2e.json parses into the preset it holds' passes in src/core/preset.test.ts; the test fails when a formula in the file is broken. Listed in presets/README.md.
- AC2: 'pc' sheet set, nameField 'name': str/str_max, dex/dex_max, wil/wil_max, hp/hp_max, armor, slot_1..slot_10 with fatigue_1..fatigue_10, deprived, gold, background, physique/skin/hair/face/speech/clothing/virtue/vice, plus age, bond, omen, scars, notes.
- AC3: saves '1d20 <= str', '1d20 <= dex', '1d20 <= wil' on 'pc' and on each NPC.
- AC4: 'npc' single sheet, visibility gm, one repeat section with tokens: true; a repeat block = npc_name, hp/hp_max, armor, str/dex/wil with saves, attack_1, attack_2, critical, notes.
- AC5: every attack row (pc 'weapon', npc 'attack_1', 'attack_2') has dice cells 1d4, 1d6, 1d8, 1d10, 1d12 (see the format gap above).
- AC6 open: the parse test exists; the owner still has to open the preset in a live room.
- Preview: drawn with sample and empty values at 640x720, no console errors; NPC block fits in 9 columns.
- Full check: oxfmt check clean; lint exit 0 (warnings only in files this task did not touch); typecheck exit 0; bun test 2558 pass 0 fail; test:browser 464 passed; build ok.
- Spec: _bmad-output/implementation-artifacts/spec-task-44-cairn-2e-preset.md. Format gaps also in deferred-work.md.

2026-11-12: the owner opened the preset in a live room after deploy 467da22d: «в целом есть».
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-11T22:36:00Z

---

Owner: search the web first; GitHub has many Cairn character sheet projects to learn the stat set and layout from.

---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
presets/cairn-2e.json ships a Cairn 2e preset checked against the SRD: a sheet set for player characters with attributes, saves, HP, armor, deprivation, ten inventory slots with fatigue, weapons and traits, and a GM-only NPC single sheet whose linkable repeat blocks hold the Cairn stat block. A parse test covers every shipped preset. Format gaps (damage die from a field, roll labels from fields, crit rules, nested attacks in an NPC, slot counting) are in deferred-work.md.
<!-- SECTION:FINAL_SUMMARY:END -->
