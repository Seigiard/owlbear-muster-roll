# The builder for preset and snapshot, and dev commands

The builder edits the preset and a snapshot together, shows the window as a GM and as a player, and reads and writes the files on disk. It is the one page for the developer on `localhost` and for every GM on the deployed site. Capabilities CAP-36 to CAP-40 in `SPEC.md`. Prototypes: `../../forge/one-dev-entry/prototypes/round-1.html` to `round-5.html`.

## Screen

- Left: the structure tree and the form of the selected item (`preset-builder.md`).
- Right: the preview, which is always the extension window: the sidebar lists the snapshot's sheets, each sheet set ends with "+ Добавить", and a sheet set with no sheets shows a pale "Образец".
- Over the window: the switch «Мастер / Игрок».
- Top bar, right: one file block for the preset and one for the snapshot.

## Click in the preview

| Action | Result |
| --- | --- |
| First click on a cell | Selects its item in the tree; the form shows it |
| Second click or Enter on the selected cell | Types a value into the snapshot |
| Esc while typing | Leaves typing; the cell stays selected |
| Second click on a dice cell | Rolls |
| Click on a sheet in the sidebar | Opens that sheet |

A structure edit applies to every sheet of its template.

## Player view

«Игрок» draws the same records through `src/core/visibility.ts`:

- GM-only sheet sets, single sheets and tabs disappear;
- a sheet of a sheet set reads only, because a snapshot holds no owners or write rights;
- a single sheet with `players: "edit"` stays editable;
- a sheet the GM had open that players cannot see shows a note in its place.

## Files

The page reads and writes the attached file through the File System Access API (Chromium). Safari and Firefox open a file and download: no write, no follow.

| Event | Result |
| --- | --- |
| A save on disk | The preview redraws with no reload; the status says when |
| An edit in the page | Written to the file at once; the status says when |
| Both changed | A prompt: «Взять из файла» or «Оставить мои» |
| A preset with problems | Not written; the status says so; writing resumes when the problems are fixed |
| A file on disk that fails the checks | The page keeps the last good content; the block shows the refusal message |
| A page reload | Opens the draft; no file is reattached |

### File block

Each block shows the kind («Пресет», «Снимок»), the file name, a status dot and a status line, for example «сохранено в файл в 18:06», «изменился на диске», «без файла, черновик в браузере». Without a file the name reads «черновик» or «пусто».

The whole block is a button. Its menu:

1. The full path and the last sync time.
2. «Открыть другой файл…» (with a file) or «Открыть файл…»; for the preset also «Открыть пример…».
3. «Сохранить как…» (with a file) or «Сохранить в файл…».
4. «Скачать копию».
5. «Отключить файл, оставить черновик»: the content stays, writing stops.
6. «Очистить пресет…» / «Очистить снимок…»: an empty preset or snapshot. The confirmation names the linked file, which becomes empty too. Undo restores both.

## Dev commands

| Command | Does |
| --- | --- |
| `bun run dev` | Serves the builder and opens it. No Owlbear, no tunnel |
| `bun run dev:owlbear` | Serves the Owlbear adapter with `cloudflared` and prints the `manifest.json` URL for Add Extension |

Removed: the `dev:mock`, `room` and `preview` scripts; `room.html` and `preview.html` with their e2e tests; the Vite preview plugin. The mock `index.html` stays for e2e tests only.

## Rejected

| Option | Reason |
| --- | --- |
| A mock room with the engine in the page | Puts the mock adapter in production, or splits the page into dev and prod again |
| `room.html` and `preview.html` kept for people | Three previews of one preset |
| A «Структура / Данные» mode switch | Tabs by another name |
| Frame selects, input types | The frame is easy to miss |
| A hover handle that selects | Selection is hidden; no hover on touch |
| Values typed in the left form | Far from the sheet; does not scale to many sheets |
| A strip of sheets over the window | Overflows with many NPCs |
| A table of sheets | Loses the sheet layout |
| The snapshot's sheets listed in the tree | Keeps an implicit mode |
| GM and player windows side by side | Each window too narrow |
| Marks only, hold to peek, a thumbnail | Never the real player screen; no editing while looking; unreadable |
| File chips, a status bar with drag and drop, a files panel, a start screen | The user preferred the document-style block |
| Block actions on hover, a hover card, icon buttons, links always shown | No hover on touch; a card that vanishes; icons to guess; a noisy bar |
| One-way files (read, out by download) | The user wants the page to write the file |
