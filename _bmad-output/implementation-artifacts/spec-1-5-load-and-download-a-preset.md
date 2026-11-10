---
title: '1.5 Load and Download a Preset'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '59eb863fb1c275fe07c38d7759544456afc7f079'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The replica runs, but a room has no preset, so no sheet can exist and the window has no real content. Backlog task: TASK-7, whose ten acceptance criteria apply in full.

**Approach:** Validate a preset file in `core/preset` and `core/formula`, store it as the `preset` record through an intent command, and give the GM the no-preset state and the Settings section "Пресет" with upload and download.

## Boundaries & Constraints

**Always:** A refused file changes no data. Only `src/replica` composes the record. Formulas go through the own parser, never `eval` or `new Function`. Strings come from the copy catalog. `src/core` has no DOM or SDK import.

**Never:** Build sheets, sheet rendering, the formula evaluator, the upload diff of AD-14, the sections "Снимок" and "Копия в комнате", or room sync.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Before first projection | No projection yet | "Загрузка…"; no upload control | N/A |
| No preset, GM | First projection has no preset | "Загрузить пресет" and the gear; no NPC tab | N/A |
| Gear | No preset; gear pressed, pressed again | Content area becomes Settings with "Пресет", then returns | N/A |
| Player | Role PLAYER | Only "Загрузка…"; no control | N/A |
| Valid file | Character and NPC templates, all cell kinds, `columns`, `repeat`, `width` | Stored as `preset`, deflated and base64; survives reload | N/A |
| One id in two templates | Same id in character and NPC, or in a repeat row and outside it | Accepted | N/A |
| Short `columns` row | Fewer cells than the grid | Accepted | N/A |
| Bad file | Not JSON; unknown key, cell kind, field type or `width`; a file over the size limit | Bad file message under the button; no data change | Message |
| Duplicate id | Twice in one scope | Bad file message; no data change | Message |
| Bad field id | Fails the id pattern; `d20`, `D1`; `floor`, `ceil`; `constructor`, `__proto__`, `toString` | Bad file message; no data change | Message |
| Bad repeat | Zero or two rows; a row with no field; two repeat sections with one `sectionId` in one template | Bad file message; no data change | Message |
| Row too wide | More cells than `columns` | Bad file message; no data change | Message |
| Bad formula | Syntax error; unknown function; over 200 characters; `0d6`, `101d6`, `1d0`, `1d1001`; two comparisons; a comparison inside parentheses | Bad file message; no data change | Message |
| Good formula | `1d20 <= str - 2*str_tired`, `floor(a/2)+ceil(b)`, `2D6+1` | Accepted | N/A |
| Record too large | Compressed record cannot fit one message | Bad file message; no data change | Message |
| Newer `v` | `v` above the current | "Файл из более новой версии. Перезагрузите страницу."; no data change | Message |
| Old or absent `v` | `v` lower, absent, or not an integer | Bad file message; no data change | Message |
| Download | Preset loaded | File holds the structure, no values, current `v`; uploading it in another room gives the same structure | N/A |
| No preset, Settings | Settings open | "Скачать пресет" disabled with "Сначала загрузите пресет."; upload first and primary, download secondary | N/A |
| Sheets exist | A non-deleted `sheet:` record | "Загрузить пресет" disabled with "Удалите листы, чтобы заменить пресет."; a command that races it is rejected | N/A |

</frozen-after-approval>

## Code Map

- `src/core/records.ts` -- `preset` record `d` is base64. Reuse.
- `src/core/ui-messages.ts`, `src/replica/engine.ts` -- add a command; `composeSheetCreate` and the fit check are the pattern.
- `src/ui/replica-client.ts` -- `sendCommand` returns the command id; `$rejection` carries it.
- `src/ui/projection-store.ts` -- needs a loaded state.
- `src/ui/shell/window-shell.tsx`, `tab-bar.tsx` -- all panels share `children`; needs per-tab content and controlled selection.
- `src/ui/primitives/button.tsx` -- `disabledReason` is the only way to disable. `react-aria-components` has `FileTrigger`.
- `src/ui/copy.ts` -- `badFile`, `newerFile` exist; `noPresetForSnapshot` holds the text AC 9 needs and is unused: rename it `presetRequired`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/format-version.ts` -- `FORMAT_VERSION = 1`, the one `v` of AD-12 -- AC 6, 7, 8.
- [ ] `src/core/formula.ts` -- tokenizer and recursive parser returning a tree -- AC 5.
- [ ] `src/core/preset.ts` -- schema, scope and id rules, `parsePresetFile`, `encodePreset`, `decodePreset` -- AC 2 to 8.
- [ ] `src/core/ui-messages.ts`, `src/replica/engine.ts` -- `preset-upload { data }`; decode to validate, fit check, sheets-exist check, mint, persist, delta; rejection reasons `too-large`, `invalid-preset`, `sheets-exist` -- AC 2, 4, 10.
- [ ] `src/ui/projection-store.ts` -- `$loaded`, true after `replaceAll`; `src/ui/main.tsx` -- read the role, choose the state -- AC 1.
- [ ] `src/ui/shell/*`, `src/ui/settings/*`, `src/ui/preset-actions.tsx`, `src/ui/download.ts`, `src/ui/copy.ts` -- no-preset state, Settings, upload with its message under the button, download -- AC 1, 4, 6, 7, 9, 10.
- [ ] `docs/preset-format.md`, `docs/example-preset.json` -- every JSON key and an annotated example; a test parses the example file -- AC 2.
- [ ] Tests beside each core module, engine cases in `src/replica/engine-client.test.ts`, `tests/preset.e2e.ts` with real background and window pages -- every matrix row.

**Acceptance Criteria:** the ten criteria of TASK-7. A live-room upload and download are the owner's check.

## Implementation Notes

- `core/field-id.ts` owns the id rules, because `core/formula` and `core/preset` both need them. A formula identifier must also be a valid field id, so `__proto__` or a bare `floor` in a formula is a syntax error, like `d20`.
- The engine stores `encodePreset` of the preset it decoded and validated, never the window's bytes. The fit check measures the record at `c = Number.MAX_SAFE_INTEGER`, so it can run before the sheets-exist check and the mint, in the order this spec gives.
- `sheets-exist` shows no file message. The projection that holds the racing sheet also disables the upload with "Удалите листы, чтобы заменить пресет.".
- The window treats a stored preset that does not decode as no preset. The engine validates before it stores, so only a damaged storage can produce one.
- `WindowShell` takes a `layout` union: `tabs` with controlled selection and per-tab content, `toggle` for the lone gear (`aria-pressed`), and `plain` for the player. A change of layout kind remounts the banner live region.
- The download revokes its object URL on the next task, because some browsers read it after the click returns.
- Not covered by a test: a rejection that arrives after a newer upload attempt started. The id match guards it, but the window switches views before a test can observe it.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Verification: no multi-chunk base64 encode test | medium | Filed with a mutation. Patched with a 1.5 M-character label; observed red. |
| Verification: rejection tied to its upload untested | medium | Filed with a mutation. Patched with a replace test; observed red. |
| Verification: NPC selected after reload untested | medium | Filed with a mutation. Patched in the reload test; observed red. |
| Blind: engine shows newer-version preset as bad structure | low | Window and background load from one build and reload together. Rejected. |
| Blind: undecodable stored preset counts as none | maybe-false | Only one build writes local storage today. Matters once room sync brings records from other builds. Deferred. |
| Blind: engine has no role check for `preset-upload` | false | Only this client's window sends LOCAL commands, and v1 protects honest clients only. |
| Blind: `decodePreset` inflates without a bound | low | Input comes from this client's window today. Deferred to room sync, which brings foreign records. |
| Blind: replace gives no success feedback | low | Not in TASK-7 criteria. The AD-14 diff story owns "Формат листов изменён.". Deferred. |
| Blind and Edge: upload that never reaches the engine is silent | low | Carried from the TASK-6 deferral on command delivery evidence. Upload shows only after the first projection, so an engine is listening. |
| Blind: 200-character test is a false green | medium | Confirmed: the 197-digit literal fails as unsafe. Patched with spaces; observed red. |
| Blind and Edge: fixed 200 ms wait in e2e storage checks | medium | Patched: checks wait for a positive signal. |
| Blind: `default` branch hides missing failure codes | low | Direct correction. Patched with an exhaustive check. |
| Blind: docs call every comparison roll-under | low | Direct correction. Patched. |
| Blind: docs leave evaluation undefined | false | The evaluator belongs to the dice story; this story only parses. |
| Blind: formula may name a text field | low | Roll-time error by `preset-format.md`. Rejected. |
| Blind: docs omit some limits | low | Rejected: the bad file message names the cause. |
| Blind: annotated example can drift | low | Rejected: a doc copy; the tested file is the source. |
| Blind: tests hard-code the size window | low | Direct correction. Patched to derive from `MESSAGE_BYTE_LIMIT`. |
| Blind: download URL revoked too early | low | Direct correction. Patched: link attached, revoke after a named 30 s constant. |
| Blind and Edge: error lost on gear toggle | low | Rare and needs lifted state. Rejected. |
| Edge: older attempt overwrites a newer one | low | Needs two file picks inside one read. Rejected. |
| Edge: `file.text()` rejection is silent | low | Direct correction. Patched with the bad file message. |
| Edge: unbounded `detail` in the message | low | Direct correction. Patched to 40 characters. |
| Edge: no cap on `columns` | low | Harm appears only when sheets render. Deferred to Story 1.8. |
| Edge: `getRole` rejection leaves a blank window | false | The role read follows platform ready, as every other port call does. |
| Edge: role change during the session | false | Already deferred to Story 2.2. |
| Edge: present to absent keeps Settings open | false | No path removes a preset in this story. |
| Edge: `v` above the safe range reads as unsupported | low | Confirmed. Patched: integer check first, then newer. `v: 1.5` stays a bad file as the matrix says. |

## Design Notes

File shape, all objects strict:

```
{ v, character: Template, npc: Template }
Template = { sections: Section[] }
Section  = { title?: string, width?: '1/3'|'1/2'|'full', columns?: positive integer, repeat?: true, rows: Cell[][] }
Cell     = { kind:'text', text } | { kind:'field', type:'text'|'number'|'check', id } | { kind:'dice', formula }
```

- Check order: size, JSON, `v` (a newer file may have an unknown shape), structure, then rules. `v` above `FORMAT_VERSION` gives `newer`. No migration exists yet, so a lower `v` is refused. The first format change adds the registry.
- Scopes: all non-repeat fields of one template are one scope; each repeat row is its own. `sectionId` is the first field id of the repeat row, unique per template. A formula may name any id; an unknown id is a roll-time error (`preset-format.md`).
- Failures are a union in `core`: `{ code, detail? }`. `src/ui/preset-errors.ts` maps them to the reasons, added to the catalog with these exact texts: `это не JSON`; `неверная структура`; `неподдерживаемая версия формата`; `недопустимый id поля «{id}»`; `поле «{id}» повторяется`; `в повторяемой секции нужна одна строка хотя бы с одним полем`; `две повторяемые секции с id «{id}»`; `в строке больше ячеек, чем колонок`; `ошибка в формуле «{formula}»`; `файл слишком большой`. `invalid-preset` from the engine uses `неверная структура`. Add `presetLocked: 'Удалите листы, чтобы заменить пресет.'`.
- Grammar: `comparison = sum [('<='|'<'|'>='|'>') sum]`; `sum = product (('+'|'-') product)*`; `product = atom (('*'|'/') atom)*`; `atom = integer | dice | id | call | '(' sum ')'`; `call = ('floor'|'ceil') '(' sum ')'`. Minus is binary only, as the grammar lists it. `NdM` takes `d` or `D`, and an identifier character right after `M` is a syntax error. An integer above `Number.MAX_SAFE_INTEGER` is a syntax error. `d20` alone is a syntax error, because no field can have that id.
- The window sends the deflated data, not the JSON, because a preset over 15000 bytes of JSON can still fit once deflated. The engine decodes and validates again before it composes the record. A file over 1 MiB is refused before parsing, so a huge file cannot hang the window.
- A tab bar with one tab cannot switch away. In the no-preset state the bar holds only the gear, as a toggle button named "Настройки" with `aria-pressed`. In the other states the gear stays a tab.
- While loading, keep the NPC tab and the gear, as today. With a preset, the NPC tab shows "Загрузка…" until Story 1.6, and the arrival of a first preset selects Settings, so the GM sees the result.
- With no tabs (player), the shell renders `children` in a plain content area.
- Download uses a Blob and `a[download]`, file name `muster-roll-preset.json`, JSON with two-space indent. Upload is disabled through `disabledReason` and has no `FileTrigger` then.
- A file error stays until the next upload attempt. A rejection counts only when its id equals the id of this upload.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: upload `docs/example-preset.json` in a live room, press "Скачать пресет" and confirm the browser saves the file, reload the page and confirm the preset stays. The Owlbear iframe may block downloads; only a live room can show it.
