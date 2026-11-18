# Builder

The standalone builder creates a preset and a snapshot without hand-written
JSON. Its preview shows the resulting sheets.

## Sub-features

- `builder-structure`: add templates, tabs, sections, rows and cells.
- `builder-example`: open a bundled example from the preset file block.
- `builder-preview`: inspect and edit a preview as GM and player.
- `builder-file`: download a preset and load it in the extension window.
- `builder-draft`: restore a draft after reload; undo and redo changes.

## How to get to it (user POV)

Open `/builder.html`, or use the builder link in extension Settings.
Use the structure tree for additions and the right-side form for properties.
Use the `Пресет` file block for examples, open, save and download actions.

## Driving it with Playwright

Run `bun run verify builder` for the existing builder browser scenarios.

Use a fresh context at a 1400×1000 viewport; no background is needed.
Wait for `page.getByRole('treegrid', { name: 'Структура' })`.
Inside it, click the exact row `Добавить одиночный лист`.
Fill `[data-builder-form]`'s textbox `Заголовок` with `Инвентарь`.
Wait for `Черновик сохранён`, reload, and assert the tree row
`Инвентарь · Одиночный лист` is selected and the form still says `Инвентарь`.
Record the action, before/after screenshots and trace.

For examples, click the header button whose text starts with `Пресет`,
then the menuitem `Пример: d20`. In a nonempty draft, handle the displayed
replacement confirmation; in a fresh draft no confirmation is expected.
Expect the selected row `Персонажи · Набор`.
The preview is `[data-preview-frame]`. Scope preview controls to this element,
not to the entire page, which contains the structure and property forms too.

For a file handoff, choose `Скачать копию` from the preset file-block menu,
capture the download event and save the file in `VERIFY_RUN`. Import that file
through the room's `Загрузить пресет` chooser. Its sheet-set add control must
use the title you created. See the full structure-to-room journey in
`tests/builder.e2e.ts` and snapshot preview cases in `tests/builder-snapshot.e2e.ts`.
Test the Settings entry point separately: click its builder link and observe
the new page's URL, rather than replacing that step with direct navigation.

## Gotchas

- A fresh empty preset has a problem and cannot be downloaded. Add valid
  structure or use an example; do not remove the download assertion.
- Tree labels repeat for add controls. Scope to `Структура` and use the
  intended ancestor or `.last()` only when the target structure warrants it.
- Scroll a tree row into view before clicking. React Aria can restore its
  old scroll position until the next animation frames; the existing `pick`
  helper in `tests/builder.e2e.ts` handles this.
- Existing tests fake the browser File System Access boundary. A run using
  that fake proves app file-handling behavior, not the native OS picker.
- A full native file-input fallback round trip is a known coverage gap.
  The pending builder candidate is not integrated by this verification task.
