# Snapshots

A GM downloads the room's sheets, values and token links as a file. Loading a
snapshot replaces room data after a confirmation. The builder can edit that
file alongside a preset.

## Sub-features

- `snapshot-download`: save a file containing current sheets and values.
- `snapshot-replace`: load it after confirmation and observe restored values.
- `snapshot-cancel`: cancel replacement without changing the room.
- `snapshot-builder`: open a snapshot in the builder and download its changes.

## How to get to it (user POV)

Choose `Настройки`, then `Скачать снимок` or `Загрузить снимок` in `Снимок`.
In the builder, open the `Снимок` file block and choose its file action.

## Driving it with Playwright

Run `bun run verify data` for snapshot and preset scenarios.
Run `bun run verify quick` for the actual downloaded-file round trip and
post-import restart. That test uses the unchanged downloaded bytes and checks
literal original field values in the UI, rather than rebuilding the file.

For an interactive replacement, create a sheet named `Проверка` through the
[sheet controls](sheets.md). Download a snapshot, then rename that sheet
to `После снимка` and commit the field. Open Settings, start a `filechooser`
wait before clicking the exact button `Загрузить снимок`, and set its file to
the saved file. Read the confirmation, then choose its confirm
button. Expect `Данные комнаты заменены`; reopen the sidebar entry `Проверка`
and confirm the header name is restored. Restart both room pages and check
again. Observe the resulting sheet list as well as the toast.

Repeat with a changed name but choose `Отменить` in the confirmation.
The changed name must remain. Preserve before/after screenshots, the uploaded
file and trace for both decisions. For token-link and omitted-field cases,
reuse `tests/snapshot.e2e.ts`'s fixtures and expectations.

For builder handoff, use `tests/builder-snapshot.e2e.ts` and the file-block
menu recipe in `tests/builder.e2e.ts`: scope the header button to the block
whose text starts with `Снимок`, choose the displayed open-file action, then
edit a value in `[data-preview-frame]`. Download via `Скачать копию`, retain
the bytes and load them through the room's snapshot chooser. The room must
show the edited value; a preview alone does not prove the handoff.

## Gotchas

- A snapshot contains no preset. Load a compatible preset first.
- The replacement discards rights and player associations. Use only the
  disposable mock room created by this run.
- With no loaded preset the snapshot controls are disabled. Record the
  missing precondition rather than bypassing it with internal commands.
- File System Access fakes in existing builder tests do not test an OS dialog.
- Keep downloaded files outside the browser's temporary download directory,
  which disappears when its context closes.
