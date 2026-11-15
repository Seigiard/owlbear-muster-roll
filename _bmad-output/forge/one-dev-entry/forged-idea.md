# Forged idea: one dev entry

Outcome: hardened, then shaped in `grill-design` rounds 1–5 (2026-11-15).

## Decisions

- **One page for everyone:** the builder (`builder.html`) is the one page for the developer on `localhost` and for every GM in production. No separate dev editor.
- **Preset and data in one editor:** the preview is always the extension window, drawing the snapshot's real sheets. The tree edits the preset; the sheets in the preview edit the snapshot.
  - The window sidebar lists the snapshot's sheets; each sheet set ends with "+ Добавить".
  - A sheet set with no sheets shows a pale "Образец", so its structure can still be clicked.
- **Click model in the preview (double click):** the first click on a cell selects its node in the tree; a second click or Enter types a value; Esc leaves typing. A dice cell rolls on the second click. Structure edits apply to every sheet of the template.
- **GM and player view:** a "Мастер / Игрок" switch over the one window. The player view is a pure render of the same records, filtered by `src/core/visibility.ts`: hidden templates and tabs disappear, sheets players may not edit read only. No engine, no mock adapter in production. Sync stays covered by e2e tests.
- **Preset and snapshot are two files** (the snapshot is `src/core/snapshot-file.ts`, the user's "content.json").
- **Files are read and written:** an edit in the page saves to the attached file at once; a save on disk redraws the page. When both changed, a prompt offers "Взять из файла" or "Оставить мои".
  - Chromium does this through the File System Access API. Safari and Firefox get open and download only: progressive enhancement. The Vite preview plugin goes.
- **File blocks in the top bar,** one for the preset and one for the snapshot, at the right: kind, file name, a status dot and line ("сохранено в файл в 18:06", "изменился на диске", "без файла, черновик в браузере"). The whole block is a button that opens a menu:
  - the full path and the last sync time;
  - "Открыть другой файл…" / "Открыть файл…", and "Открыть пример…" for the preset;
  - "Сохранить как…" / "Сохранить в файл…";
  - "Скачать копию";
  - "Отключить файл, оставить черновик": the content stays, writing stops;
  - "Очистить…": an empty preset or snapshot. A linked file becomes empty too; the confirmation says so, and undo restores it.
- **Values a changed preset has no place for drop.** No guard, no counter: authors know a preset change loses data.
- **Commands:**
  - `nr dev`: server, opens the builder.
  - `nr dev:owlbear`: Owlbear adapter plus `cloudflared`; prints the `manifest.json` URL for Add Extension.
  - Removed: `dev:mock`, `room`, `preview`; `room.html`, `preview.html` and their e2e tests. The mock `index.html` stays for e2e only.

## Changes to earlier decisions

- Forge `preset-builder`: "a click on a preview cell selects it in the tree" is now the first click only; the second click types.
- This forge first said data flows one way (file to page, out by download). The user reversed it in grill round 4: the page writes the file too.

## Rejected

- **A real mock room (engine, two clients) in the page:** puts the mock adapter in production, or splits the page into dev and prod again.
- **Keeping `room.html` and `preview.html` for people:** three previews of one preset.
- **A "Структура / Данные" mode switch, a frame-vs-input click, a hover handle, values typed in the left form:** modes are tabs by another name; the frame is easy to miss; the handle hides selection; the form is far from the sheet and cannot handle many sheets.
- **A sheet strip or a table of sheets, a snapshot list in the tree:** the strip overflows with many NPCs; the table loses the sheet layout; the tree list keeps an implicit mode.
- **Two windows side by side, marks only, hold to peek, a thumbnail:** too narrow; never the real player screen; no editing while looking; unreadable.
- **File chips, a status bar with drag and drop, a files panel, a start screen:** the user preferred the document-style block.
- **File block actions on hover, a hover card, icon buttons, always-visible links:** no hover on touch; a card that vanishes; icons to guess; a noisy bar.

## Prototypes

The five grill rounds, each a standalone page with a design picker: `prototypes/round-1.html` … `prototypes/round-5.html` beside this file.
