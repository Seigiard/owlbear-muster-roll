# Presets

Preset files kept here show up in the local preset preview, beside `docs/example-preset.json` and the test fixtures. Run `bun run preview` to open it, or `bun run preview path/to/preset.json` to open a file from anywhere on disk first. The page draws the chosen file and draws it again each time you save it. See "Preview a preset" in `docs/preset-format.md`.

A test in `src/core/preset.test.ts` parses every `.json` file here, so each one stays a valid preset.

## Files

- `cairn-2e.json`: [Cairn 2e](https://cairnrpg.com/second-edition/), whose text is under CC-BY-SA 4.0.
  - «Персонажи», a sheet set named by the character's name: STR, DEX and WIL with their current and maximum values and a save each (d20 roll-under the current value), HP, Armor, ten inventory slots (four for hands and body, six in the backpack) with a Fatigue mark per slot, the Deprived state, coins, age, background, the eight traits, bond, omen, scars and notes. Weapons are a repeat section.
  - «NPC», a single sheet that only GMs see. Each repeat block is one NPC with the SRD stat block: name, HP, Armor, STR, DEX and WIL with saves, two attacks, Critical Damage and notes. Each repeat block can link to a token.
  - Each weapon row has a dice-choice field for the damage die. Pick d4 when the attack is impaired or unarmed, and d12 when it is enhanced.
