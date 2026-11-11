---
id: TASK-41
title: Let a preset define any number of sheet sets and single sheets
status: Done
assignee:
  - '@claude'
created_date: '2026-11-11T20:37:00Z'
updated_date: '2026-11-11T23:28:00Z'
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
- [x] #1 A preset defines any number of Наборы and Листы, each with its own sections, rows and cells, and a second-system preset with Инвентарь and Список заклинаний works with no code change
- [x] #2 The GM creates, renames and deletes sheets of each Набор; the tab name of each sheet comes from the field the preset names for that Набор
- [x] #3 Each Лист exists exactly once in the room and shows as its own tab
- [x] #4 Visibility and write access for each Набор and Лист follow the rules the spec settles, and NPC data stays hidden from players if the spec keeps NPC GM-only
- [x] #5 Existing presets and rooms in the current format behave as the spec settles (converted, still accepted, or refused with a message)
- [x] #6 SPEC.md, preset-format.md, docs/preset-format.md, the architecture spine and EXPERIENCE.md describe the new model before the code lands
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research the two-template model across spec, docs, architecture, UX and code; return an impact map and owner decision briefs (stop).
2. After owner answers: bmad-spec update (SPEC.md, preset-format.md, memlog), bmad-architecture update, bmad-ux update for the extension window only (not the builder, TASK-38).
3. Implementation spec in the TASK-40 pattern, build with tests, lint, typecheck, bun test, Playwright, reviews.
4. Update docs/preset-format.md, docs/example-preset.json and tests/fixtures/presets/*.json to the new format.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research done (step 1). Impact: ~98 files name the two-template model (70 of them tests). Format change bumps the shared FORMAT_VERSION (messages, room copy, stored records mr1, snapshot file, preset file). Room copy margin today 3286 bytes on the d20 worst case. Waiting for owner decisions: NPC model (Лист vs Набор on one page) with duplicates and token links; visibility per Набор/Лист; write access and owners for Листы; tab name field rules; old-format presets and rooms; tab bar order; upload that removes a Набор/Лист with sheets; token links to Листы.

Owner answers 2026-11-11 (relayed by coordinator):
- D1/D8: NPC is an ordinary Лист; fixed NPC tab, NPC-only code and per-sheet NPC duplicates (old CAP-16) removed («дубли и привязка похуй, всё можем почистить, там почти ничего нет»). Token linking is a preset property tokens on a Набор, a Лист and a repeat section («почему не tokens: в репит секции»). On a repeat section each block links to its own token; the token opens the sheet and scrolls to the block; a link stores sheet + block; deleting a block removes its links; token label comes from the block's first field. On a Набор or Лист a token links to the whole sheet. Дублировать moves to repeat blocks in any repeat section. Multi-line repeat allowed: all rows of a repeat section form one block; upload rule «в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем».
- D2: visibility property on each Набор and Лист; hidden = GM-only in the interface, rolls GM-only, no player token menu.
- D3: Листы take no per-player grants; preset players: edit lets players edit, otherwise not. Набор sheets keep access panel and owner.
- D4: required preset key on each Набор naming a non-repeat text field as tab name; anyone with write access edits it; header name edits the same field; empty value shows a fallback.
- D5: no migrations; v1 data not read, v1 files refused with a message; add GM-only «Очистить всё» in Settings that wipes room copy, local copy and all records after one confirmation (new capability).
- D6: one scrolling tab list in preset order, only the gear pinned, a + per Набор after its last sheet, a player's own sheets first.
- D7: allowed; the upload confirmation also names how many sheets are deleted.
- Defaults accepted: stable id + title per entry, Лист sheet id from preset id, at least one entry, snapshot import drops sheets of unknown Наборы with a count, link picker groups in preset order.

Build (spec _bmad-output/implementation-artifacts/spec-task-41-sheet-sets-and-single-sheets.md), terms per GLOSSARY.md and docs/adr/0001:
- AC1: tests/templates.e2e.ts uploads tests/fixtures/presets/d6-pool.json (NPC, Инвентарь, Список заклинаний as single sheets, Экипаж as a sheet set); tests/single-sheets.e2e.ts uploads two systems with no code change; docs/example-preset.json parse test.
- AC2: sheet create/delete e2e (characters, delete); name field edits by GM, by a player with write access and in-sheet show in tab, header and picker (tests/hidden-sheets.e2e.ts); empty name shows «Без имени».
- AC3: single sheet tab, no sheet: record, values persist (tests/single-sheets.e2e.ts).
- AC4: hidden NPC single sheet: no tab, no token menu, no roll notification for a player (tests/hidden-sheets.e2e.ts); players: edit committed by a GM, otherwise denied (tests/propose.e2e.ts, tests/pending.e2e.ts); per-player access on sheets of a sheet set (tests/access.e2e.ts).
- AC5: v1 preset refused «неподдерживаемая версия формата» (tests/preset.e2e.ts); v1 room copy: GM banner, player «не читается», wipe empties every client and a v2 upload works (tests/wipe.e2e.ts).
- AC6: spec, preset-format, docs, spine and EXPERIENCE committed before the code (e4286cc..27c002a, code from a0bf24a); on master via 7ca307f, b358153, bbfa605.
- Room copy worst case 9270 bytes, margin 6230 over the 1500-byte gate.
- Review: 6 reviewer layers, 36 findings triaged in the spec; patches in 50437a2 and 5b5c9b1; 2 items in deferred-work.md.
- Checks on 8916ad4: oxfmt clean, lint 0 errors, typecheck clean, bun test 2440 pass 0 fail, test:browser 443 passed, build ok.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A preset is now a list of templates (format v2): sheet sets give any number of sheets named by a name field, single sheets exist once. Visibility, player-editable and linkable are template properties; NPCs are repeat blocks of a single sheet, with per-block token links and Duplicate. Version 1 data is refused, and a GM wipe («Очистить всё») clears a room. Spec, architecture, UX, docs and fixtures follow the glossary terms. All checks pass (bun test 2440, e2e 443). Follow-ups: the owner's live-room check; two deferred items (DOM order of the + buttons, orphan sheets after a create races an upload).
<!-- SECTION:FINAL_SUMMARY:END -->
