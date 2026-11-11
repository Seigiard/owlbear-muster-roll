---
id: TASK-41
title: Let a preset define any number of sheet sets and single sheets
status: To Do
assignee: []
created_date: '2026-11-11T20:37:00Z'
labels:
  - v2
dependencies: []
references:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - docs/preset-format.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/.memlog.md
type: feature
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today a preset holds exactly two templates, `character` and `npc`, and the GM types each tab name by hand. During the preset builder UX session (TASK-38) the owner set a different model: a preset is a list of sheets, each with its own schema. A **Набор** (format term `many`) is a schema the GM creates many sheets from, such as player characters; one field chosen in the preset names each sheet tab. A **Лист** (format term `one`) exists once in the room with its own schema, such as NPC, Инвентарь (shared inventory), История or Список заклинаний. Do not call a Набор "character sheets": the name must stay abstract.

The change reaches SPEC CAP-2, CAP-4, CAP-14, CAP-16..19, `_bmad-output/specs/spec-muster-roll/preset-format.md`, `docs/preset-format.md`, the architecture spine, the extension tab bar in EXPERIENCE.md, the room copy size budget and snapshot import. The builder UX (TASK-38) is paused until this spec is closed, because the builder tree root is this list of sheets.

Owner decisions still open, to settle in the spec phase: who sees and who edits each Набор and Лист (NPC is GM-only today); whether NPC becomes a Лист and what happens to NPC duplicates and token links; ownership and write access for Листы; what happens to existing presets and rooms in the current format; the tab bar order.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A preset defines any number of Наборы and Листы, each with its own sections, rows and cells, and a second-system preset with Инвентарь and Список заклинаний works with no code change
- [ ] #2 The GM creates, renames and deletes sheets of each Набор; the tab name of each sheet comes from the field the preset names for that Набор
- [ ] #3 Each Лист exists exactly once in the room and shows as its own tab
- [ ] #4 Visibility and write access for each Набор and Лист follow the rules the spec settles, and NPC data stays hidden from players if the spec keeps NPC GM-only
- [ ] #5 Existing presets and rooms in the current format behave as the spec settles (converted, still accepted, or refused with a message)
- [ ] #6 SPEC.md, preset-format.md, docs/preset-format.md, the architecture spine and EXPERIENCE.md describe the new model before the code lands
<!-- AC:END -->
