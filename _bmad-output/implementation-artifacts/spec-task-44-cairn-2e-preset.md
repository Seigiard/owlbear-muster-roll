---
title: 'TASK-44 Ship a Cairn 2e Preset'
type: 'feature'
created: '2026-11-12'
status: 'in-review'
baseline_commit: '0e64ed68af58a733efa87768b762bbf1f625e0d4'
route: 'one-shot'
context:
  - '{project-root}/docs/preset-format.md'
  - '{project-root}/docs/adr/0001-presets-are-lists-of-sheet-sets-and-single-sheets.md'
---

## Intent

**Problem:** The owner runs Cairn 2e and has to write its preset by hand. It is also the first real game preset on the v2 model of ADR 0001. Backlog task: TASK-44, whose six acceptance criteria apply in full.

**Approach:** One preset file, `presets/cairn-2e.json`, on the current format with no format change. A parse test over every `.json` file in `presets/` keeps it valid. The SRD at https://cairnrpg.com/second-edition/ (CC-BY-SA 4.0) is the source of the stats and the roll rules.

## Boundaries & Constraints

**Always:**
- A `pc` sheet set named by `name`, and an `npc` single sheet with `visibility: "gm"` whose only section is a repeat section with `tokens: true`, one NPC per repeat block.
- Saves are `1d20 <= str`, `1d20 <= dex`, `1d20 <= wil`: a d20 equal to or under the current value.
- Interface text in the preset is Russian, as in the other presets. The stat names stay STR, DEX, WIL and HP, as Cairn players know them.

**Never:**
- A change to the preset format, the parser or the window. A gap goes to `deferred-work.md`.
- Content copied from sheet projects without a license.

## Design

- Character: name, background, age, coins (gp); STR, DEX and WIL with current and maximum values and a save each; HP current and maximum; Armor; Deprived; ten inventory slots, 1–4 for hands and body and 5–10 for the backpack, each a text field and a Fatigue check; a Weapons repeat section; the eight SRD traits; bond, omen, scars and notes.
- NPC repeat block, after the SRD stat block "X HP, X Armor, X STR, X DEX, X WIL, Attack (dX)": name (the token label), HP current and maximum, Armor, STR, DEX and WIL with saves, two attack rows, Critical Damage and notes. Nine columns keep one NPC in six rows at the window width.
- A formula cannot read a die size from a field. So each attack row has five dice cells, `1d4` to `1d12`: the player rolls the weapon's die, d4 when impaired or unarmed, and d12 when enhanced, as the SRD says. With no text cell before them, each dice cell is labelled by its formula.
- `window` is 640 by 720 px, so the half-width sections sit side by side.

## Verification

- `bun test src/core/preset.test.ts -t "presets/"`: the file parses into the preset it holds, and every field id in a formula resolves from its dice cell. A broken formula or a misspelt id makes the test fail.
- The preview (`bun run preview presets/cairn-2e.json`) draws both templates with sample and empty values, with no console error.
- The full check from `CLAUDE.md`.
- The owner opens the preset in a live room (AC #6).

### Review Findings

Code review of `0e64ed6..8dcae04` on 2026-11-12.

- [x] [Review][Decision] Each attack rolls one of five generic dice, not its own damage formula — AC #4 and #5 ask for "attacks with damage dice" and "a dice cell for its damage formula". Every attack row (`weapon`, `attack_1`, `attack_2`) has `1d4` to `1d12`, and the player picks the die. The format gap is recorded, but the owner has not accepted this reading of AC #5. Resolved 2026-11-12: the owner wants a select field type (TASK-51) and a dice-choice field a formula can roll (TASK-52), which fixes the Cairn weapons.
- [ ] [Review][Decision] Some fields get a wrong or English accessible name — `cellLabel` names a field after the nearest text cell before it in its row, else after its id. A screen reader says `weapon`, `npc_name`, `attack_1` and `attack_2`; `str_max`, `dex_max` and `wil_max` share the name of `str`, `dex` and `wil`; `hp_max` is «из». A fix adds text cells and changes the layout.
- [x] [Review][Decision] The NPC section is titled «Противники» but holds every NPC — allies, retainers and hirelings go there too. Resolved 2026-11-12: the owner chose «NPC».
- [x] [Review][Patch] No check that a formula names a field its dice cell can read [src/core/preset.test.ts:1104]
- [x] [Review][Patch] The test name "the shipped presets" says the files ship, but nothing bundles `presets/` [src/core/preset.test.ts:1083]
- [x] [Review][Patch] `deferred-work.md` lists four of the five format gaps; slot counting was missing [_bmad-output/implementation-artifacts/deferred-work.md]

Rejected:
- low: no field is called "description" (AC #2). The eight SRD traits and `notes` hold it; the fix only edits the AC evidence.
- low: a natural 1 and 20 on a save. Already in `deferred-work.md`; the plain roll-under matches for attributes 1–19.
- low: `presets/README.md` does not say how to load the file into a room. The README serves the dev preview; loading is in `docs/preset-format.md`.
