# Sheets and navigation

A GM creates sheets from a sheet set, edits values and navigates between
ordinary tabs and repeat blocks. Values remain after the room pages restart.

## Sub-features

- `sheet-create`: add, name and delete a sheet.
- `sheet-name`: rename through the header and through the sheet's name field.
- `sheet-values`: text, number, checkbox, select and dice-choice editing.
- `sheet-repeat`: add, delete and duplicate repeat blocks, including nesting.
- `sheet-navigation`: sidebar, tabs, repeat tabs and block selection.
- `sheet-restart`: persist fields and repeat blocks across room-page restarts.

## How to get to it (user POV)

Open the extension window, choose `Настройки`, then `Загрузить пресет`.
Choose `+ Добавить` under the intended sheet set and reopen sheets through
their sidebar entries. Edit the name in the header or the sheet's name field.
Select tabs and repeat blocks inside the sheet.

## Driving it with Playwright

Run `bun run verify sheets`. This profile covers the existing creation,
editing, layout, navigation, select and repeat specs listed in the index.
Use `bun run verify quick` for the new cross-feature round trips.
For dice-choice editing, also run `bun run verify rolls`.

For an interactive check, create `/index.html` first and keep a second page
at `/background.html` in the same context. Load `docs/example-preset.json`
through the `Загрузить пресет` file chooser. Click the exact button
`Добавить: Персонажи`, fill `Имя листа`, and press Enter.
The exact sidebar tab must show the entered name.

Select that sheet, fill its tabpanel's exact `Имя` textbox and blur it.
The header and sidebar must both show the new name. For fields use the
example's exact names `Класс` and `Уровень`.
Close the background, reload the window, reopen the background and select the
sheet again. Assert the literal entered values in the rendered fields.
On another edit, press Escape and confirm the previously saved value returns.

For repeat blocks and tabs, reuse the fixtures and locators in
`tests/repeat-blocks.e2e.ts`, `tests/nested-repeat.e2e.ts`,
`tests/navigation-v4.e2e.ts` and `tests/tabs.e2e.ts`. A preset change that moves
a section must preserve that section's block values and order in its new tab.

## Gotchas

- A window without its background stays at `Загрузка…`.
- An empty sheet set has no editable sheet until one is created.
- Header and sheet name textboxes are distinct. Use exact accessible names.
- Restart the background too; a window reload alone can read replica memory.
- Known copied nested token reveal trouble is recorded under token links,
  not hidden by a successful ordinary-tab test.
