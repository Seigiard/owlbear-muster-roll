---
name: Muster Roll
status: final
created: 2026-11-10
updated: 2026-11-10
sources:
  - ../../../specs/spec-muster-roll/SPEC.md
  - ../../../specs/spec-muster-roll/preset-format.md
  - ../../../specs/spec-muster-roll/storage-and-sync.md
  - ../../architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
---

# Muster Roll — Experience Spine

## Foundation

One surface: the action window of an Owlbear Rodeo extension, on a laptop or a tablet. Phones are out of scope. Components use react-aria. `DESIGN.md` is the visual identity reference. The interface is Russian in v1.

The extension is system-agnostic. The preset decides all sheet and NPC content and its arrangement. This document fixes only the shell around that content.

`mockups/shell.html` shows the shell, and this document and `DESIGN.md` win on conflict with it. The mock differs in these points: it treats an owner as an editor, shows the sheet name in a roll, asks for a count with a browser dialog, and uses older labels.

| Term | Meaning | Russian in the interface |
| --- | --- | --- |
| Room copy | The compressed data in room metadata | Копия в комнате |
| Room file | The snapshot file the GM downloads | Снимок |
| Owner | The player linked to a character (`plink`) | Его персонаж |
| Duplicate | A copy of an NPC (CAP-16) | Дубль |
| Window | The one action window | — |

## Information Architecture

| Surface | Who | Reached from | Purpose |
| --- | --- | --- | --- |
| Character tab | GM, player | Tab bar, token menu | One character's full sheet |
| NPC tab | GM | Tab bar, last and pinned, token menu | All NPCs on one page, each from the short template |
| Settings | GM | Gear, pinned after the NPC tab | Preset and room file actions, room copy status |
| Access panel | GM | "Доступ" chip in the character header | Who owns the character and who may edit it |
| Token menu | GM, player | Owlbear's menu on a token | Open a linked sheet, link or unlink a sheet |
| Link picker | GM | Token menu | Choose the sheet for a token |

Characters and NPCs are different things and never share a list (`imports/gm-nav-sketch.png`). There is one window. Opening a sheet from a token opens the window on that sheet's tab. For an NPC, it opens the NPC tab and scrolls to that NPC. Settings replaces the content area (`imports/gm-nav-sketch-settings.png`).

If the active sheet disappears, or the tab is no longer available to this role, the first available tab becomes active.

## Voice and Tone

Short and literal. Commands are perfective verbs. Places are nouns. Statuses are participles, adjectives or nouns.

| Job | Copy |
| --- | --- |
| Command | "Загрузить пресет", "Скачать пресет", "Загрузить снимок", "Скачать снимок", "Добавить NPC", "Добавить строку", "Дублировать…", "Удалить", "Привязать лист…", "Отвязать лист", "Открыть лист", "Отменить" |
| Place | "Настройки", "Доступ", "NPC" |
| Status | "Ожидает", "Только чтение", "Можно править", "Токен привязан", "Нет токена" |
| Loading | "Загрузка…" |
| No GM | "Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку." |
| Room copy not saved | "Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок." |
| Local save failed | "Не удалось сохранить в браузере. Скачайте снимок." |
| Room copy unreadable | "Копия в комнате не читается. Дождитесь ГМ." |
| New version | "Вышла новая версия. Перезагрузите страницу." |
| Preset upload removes values | "Значения удалённых полей будут стёрты: {count}. Загрузить пресет?" |
| Preset upload removes nothing | "Формат листов изменён." |
| Snapshot import | "Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?" |
| Snapshot import drops values | Add to the import message: "Не войдут значения удалённых полей: {count}." |
| Delete | "Удалить «{name}»? Это нельзя отменить." |
| Bad formula | "Нельзя бросить: поле «{field}» пустое или не число" |
| Bad formula result | "Нельзя бросить: формула не дала числа" |
| Bad number | "Нужно число" |
| Bad duplicate count | "Нужно число от 1 до 50" |
| Value too long | "Слишком длинно" |
| Bad file | "Файл не подошёл: {reason}. Ничего не изменено." |
| Newer file | "Файл из более новой версии. Перезагрузите страницу." |
| No preset for a snapshot | "Сначала загрузите пресет." |
| Roll | "{roller}: {sheet}, {cell} — {result}". `{result}` is the rolled number, and for a comparison also "успех" or "провал" |
| Edit denied | "Нет прав на правку" |
| Data replaced | "Данные комнаты заменены" |
| Guest note | "Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова." |

## Component Patterns

| Component | Use | Behavioral rules |
| --- | --- | --- |
| Tab bar | All surfaces | Character tabs scroll horizontally when they overflow, also with a vertical mouse wheel. A token opening a tab scrolls it into view. The player's own character is first and marked "вы". NPC and the gear stay pinned at the right for the GM. The GM's "+" follows the last character, scrolls with the tabs and is a button outside the tab list |
| Character header | Character tab | Name. GM: click to rename, "Доступ" chip, token status, "⋯" with "Удалить". Player: "Можно править" or "Только чтение" |
| New sheet | "+", "Добавить NPC" | Creates a sheet named "Новый персонаж" or "Новый NPC", opens it and focuses the name |
| Access panel | Character tab | Opens inline under the header. One row per player id, GMs excluded, from players in the room and players who already hold rights, by last known name. A radio group "Его персонаж" with a "Никто" option, and a checkbox "Может править" per player. Choosing an owner also turns editing on, and the GM can turn it off. Changing or clearing the owner does not change the previous owner's editing. Changes apply at once. With no players: "Пока никого нет". Shows the guest note |
| Preset cell | Sheets, NPCs | `text` renders its label. `field` renders its value. `dice` renders a dice button. A field's accessible name is the nearest preceding `text` cell in its row, otherwise its id |
| Field value | Sheets, NPCs | Click to edit in place, with no edit mode. A `check` toggles and saves on one click. A `text` or `number` field saves on blur or after a typing pause. A blur with no change sends nothing. A bad number or too long a value stays in the field with an error under it and is not saved. Empty values show an empty editable area. Read-only values take no focus |
| Repeat row | Sheets, NPCs | "Добавить строку" adds a row at the end. Each row has a "Удалить" control. Shown only with edit rights |
| Dice button | Sheets, NPCs | Rolls on click. A bad formula shows its message under the button and sends nothing. The message clears on the next roll or field change |
| Roll result | Global | Owlbear notification, so it shows when the window is closed. An NPC roll shows only on GM clients |
| NPC block | NPC tab | Name, click to rename, token status and "⋯" with "Дублировать…" and "Удалить". "Добавить NPC" is at the top of the tab. The rest comes from the short template |
| Duplicate | NPC menu | Inline number from 1 to 50, default 1. A name is the source name without its trailing number plus the highest existing number + 1. A source with no number stays as is. Duplicates copy values and have no token. They appear at the end |
| Token menu | Owlbear | GM on a token with no sheet: "Привязать лист…". GM on a linked token: "Открыть лист" and "Отвязать лист". Player: "Открыть лист" only on tokens linked to a character, and nothing on an NPC token. One token links to one sheet. One sheet can have many tokens. The token status in the window is read-only |
| Link picker | Token menu | Small Owlbear popover. Characters, then NPCs, with sheets with no token first. With no sheets: "Сначала создайте лист" |
| Settings | Gear | Sections in this order: Пресет, Снимок, Копия в комнате. Results and file errors appear under the button that caused them. "Копия в комнате" shows "Сохранена" and the used and available size, or the not-saved message. With no preset, "Скачать пресет", "Скачать снимок" and "Загрузить снимок" are disabled with "Сначала загрузите пресет." |
| Status banner | Under tab bar | One banner, only when something is wrong. Priority: local save failed, room copy not saved, new version, no GM |
| Confirmation | Upload, import, delete | One inline block for the whole action, at the top of the content area. Focus moves to "Отменить". Never one per field |

## State Patterns

| State | Surface | Treatment |
| --- | --- | --- |
| Loading | Window | Until the first catch-up ends, shows the tab bar from known data and "Загрузка…", and never an empty state |
| No preset | Window | After catch-up. GM: "Загрузить пресет" and the gear. Player with a GM online: "ГМ ещё не настроил листы." |
| No data and no GM | Player | "ГМ ещё не заходил. Листов пока нет." with the no-GM banner |
| No characters | Tab bar | GM sees "+", NPC and the gear. Player sees "ГМ ещё не создал персонажей." |
| No NPCs | NPC tab | "Добавить NPC" only |
| No GM responds | Player | Warning banner. Sheets stay readable. The edit stays visible |
| Pending edit | Player | The typed value shows at once. The "Ожидает" mark appears when the edit is unanswered after a short delay, or at once with no GM. A pending new repeat row carries the same mark. A pending removed row stays dimmed with the mark |
| Edit confirmed | Player | The mark disappears. No message |
| Edit denied | Player | The value returns, with the notification |
| Access revoked during an edit | Player | The field returns to read-only and the edit is dropped, with the same notification |
| Room copy not saved | GM | Danger banner. Settings shows the same fact |
| Upload or import during catch-up | GM | The buttons are disabled with "Загрузка…" for the short catch-up |
| GM edit during catch-up | GM | The value shows at once, with no mark |
| Import by another GM | Any | Pending edits are dropped, with the notification |
| Value edited by another client | Sheets | Updates in place, unless that field has focus. A focused field keeps its text. `Esc` returns it to the current value |

## Interaction Primitives

- Tap and click are the same action. No hover-only control, because tablets are supported.
- Tab order: tab bar, header, then fields in preset order.
- `Enter` commits a `number` field and a single-line `text` field. `Shift+Enter` adds a line in `text`.
- `Esc` cancels an unsaved edit and returns the current value.
- No drag in v1.

## Accessibility Floor

- react-aria tabs: arrow keys move between tabs.
- Every field has an accessible name, as in Preset cell.
- The status banner is a live region. Roll results use Owlbear's notification.
- Focus is visible on every control. Text contrast is at least 4.5:1 in both Owlbear themes.
- A control's touch target is at least 32 px high. This includes field rows.

## Responsive & Platform

The window opens at 720 by 600 px. Tablet and laptop behave the same. Check the size in a live room in the first interface story.

## Key Flows

### Oleg prepares the campaign (CAP-1, CAP-3, CAP-4, CAP-5, CAP-12, CAP-14, CAP-17, CAP-18, CAP-19)

1. Oleg, the GM, opens the empty window and presses "Загрузить пресет".
2. He presses "+", names the character and fills in the sheet. The preset's aligned sections appear as one grid.
3. Liza has joined. He opens "Доступ" and marks her as the owner, and editing turns on.
4. He opens the menu on Liza's token and picks the sheet in "Привязать лист…".
5. **Climax:** Liza opens "Открыть лист" on her token, and her sheet opens.

Failure path: a file that fails validation shows the bad file message under the button, and nothing changes. Oleg can also press "Скачать пресет" to reuse it in another room.

### Oleg runs a fight with ten skeletons (CAP-6, CAP-7, CAP-14, CAP-16, CAP-17, CAP-18)

1. Oleg opens the NPC tab, presses "Добавить NPC" and names it "Скелет 1".
2. He picks "Дублировать…" and enters 9.
3. He links each skeleton token through "Привязать лист…".
4. In the fight he opens "Открыть лист" on a skeleton token and lands on that skeleton.
5. **Climax:** he changes its hits and rolls its attack, and only GM clients see the result.

Failure path: if an attack formula uses an empty field, the bad formula message appears and nothing is sent.

### Liza plays while the GM is away (CAP-2, CAP-6, CAP-11, CAP-15)

1. Liza, on a tablet, sees her tab first, marked "вы". She sees other characters too, and no NPCs.
2. She presses a dice button, and everyone sees her name and result.
3. Oleg's tab freezes. Liza edits her hits, and sees the banner and "Ожидает".
4. **Climax:** Oleg returns, the banner disappears and the value is confirmed with no action from her.

Failure path: if Oleg has revoked her access, the value returns and she sees the notification. If she closes the tab first, the edit is lost, and the banner says so.

### Oleg changes the preset mid-campaign (CAP-8)

1. Oleg presses "Скачать пресет", edits the file and presses "Загрузить пресет".
2. The extension compares it with all sheets.
3. **Climax:** one confirmation names how many values will be erased, and he confirms.

If nothing is lost, the short notice appears instead. If he presses "Отменить" or the file is invalid, nothing changes.

### Oleg protects and moves the room (CAP-9, CAP-13)

1. The room copy no longer fits, and the danger banner appears.
2. Oleg opens "Настройки" and presses "Скачать пресет" and "Скачать снимок".
3. On another computer he loads the preset, then presses "Загрузить снимок".
4. **Climax:** the confirmation states what is replaced and what is dropped, and the sheets return with owners and rights reset to read.

Failure path: an invalid or newer file shows its message, and nothing changes.

### Players read with no GM (CAP-10)

1. Liza opens the room before Oleg joins.
2. **Climax:** she reads every character from the room copy, with the no-GM banner.

Failure path: with no room copy, she sees "ГМ ещё не заходил. Листов пока нет."

## Inspiration & Anti-patterns

- **Lifted from DummySheet:** titled sections side by side, editing by clicking a value (`imports/dummysheet-hero.png`).
- **Rejected:** a hard-coded arrangement of stats or NPC blocks, because the preset owns it.
- **Rejected:** characters and NPCs in one list.
- **Rejected:** an edit mode, and a confirmation per field.
