# Rolls

Pressing a dice cell rolls its formula using current field values. Visible
sheet rolls reach players; hidden sheet rolls reach only GMs.

## Sub-features

- `roll-visible`: show a visible sheet's result to GM and player.
- `roll-hidden`: keep a hidden sheet's result on GM clients.
- `roll-input`: use a just-edited field; reject an invalid referenced value.
- `roll-repeat`: resolve fields in the selected repeat block.
- `roll-extension`: request external dice and handle its access state.

## How to get to it (user POV)

Open a sheet in the sidebar and press its dice cell, such as `Сила`.
Repeat blocks have their own dice cells. A visible single sheet can also roll.
Players can roll a visible sheet without write access.

## Driving it with Playwright

Run `bun run verify rolls`. The quick persisted-choice journey additionally
removes `d1` from the options through a preset upload, restarts the room pages
and checks that the saved `d1` still rolls exactly `1`.

For the example preset, create and name a sheet using the sheet journey, fill
its `Сила` textbox with `12`, then click the tabpanel's exact button `Сила`.
Capture the input, click and result. This example uses `1d20 <= str -
2*str_tired`; assert a comparison result, not the additive result from another
fixture.

For deterministic delivery use the exact setup in `tests/roll.e2e.ts`: it has
`1d1 + str - 2*tired` and separate GM/player clients. Pressing the player's
`Сила` button yields `Лиза: Брок, Сила — 13` on both clients. Press `NPC` and
then `Хиты` as GM: the hidden result `Мастер: NPC, Хиты — 8` reaches the GM,
not the player. Follow with a visible roll to prove the player's delivery
path is still working. Observe mock notification output as those tests do;
host notifications are not necessarily rendered in the window DOM.

The repeat-block and invalid-field paths also live in `tests/roll.e2e.ts`;
nested-repeat dice paths live in `tests/repeat-tab-dice.e2e.ts`.
For external dice use `tests/dice-extension.e2e.ts`: matching background
parameters `mock-dice-faces` and `mock-dice-access` start a fake external dice
extension at the platform boundary. Label that evidence as simulated external
dice, not as Dice+ or Dicex interoperability.

## Gotchas

- The example's referenced field starts empty. Fill it before expecting a roll.
- An additive fixture result is not an oracle for a comparison formula.
- Duplicate dice names need scoping to the intended repeat block.
- A local roll alone proves neither recipient filtering nor external dice.
- A real Owlbear dice extension needs the owner's live-room check.
