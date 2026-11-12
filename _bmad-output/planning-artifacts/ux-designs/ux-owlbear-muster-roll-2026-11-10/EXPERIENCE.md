---
name: Muster Roll
status: final
created: 2026-11-10
updated: 2026-11-12
sources:
  - ../../../specs/spec-muster-roll/SPEC.md
  - ../../../specs/spec-muster-roll/preset-format.md
  - ../../../specs/spec-muster-roll/storage-and-sync.md
  - ../../architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
---

# Muster Roll — Experience Spine

## Foundation

Two surfaces: the action window of an Owlbear Rodeo extension, on a laptop or a tablet, and the preset builder (v2), a top-level page of the deployed site, on a laptop or a landscape tablet. Phones are out of scope. Components use react-aria. `DESIGN.md` is the visual identity reference. The interface is Russian in v1.

The extension is system-agnostic. The preset decides which sheets exist, their content and its arrangement. This document fixes only the shell around that content. The preset builder (v2, CAP-20 to CAP-28) has its own section, [Preset builder](#preset-builder), and the rules of the window sections apply to it only where that section says so.

`mockups/shell.html` shows the shell, and this document and `DESIGN.md` win on conflict with it. The mock predates sheet sets and single sheets: it shows a fixed NPC tab and a sheet per NPC, which no longer exist. It also treats an owner as an editor, shows the sheet name in a roll, asks for a count with a browser dialog, and uses older labels.

| Term | Meaning | Russian in the interface |
| --- | --- | --- |
| Sheet set | A template GMs create any number of sheets from (format `set`) | «Набор»; each one shows by its `title` |
| Single sheet | A template that is exactly one sheet (format `single`) | «Одиночный лист»; each one shows by its `title` |
| Repeat block | One copy of a repeat section's rows on one sheet | — |
| Room copy | The compressed data in room metadata | Копия в комнате |
| Snapshot | The file of all room data the GM downloads | Снимок |
| Owner | The player linked to a sheet of a sheet set (`plink`) | Его лист |
| Duplicate | A copy of a repeat block (CAP-30) | Дубль |
| Window | The one action window | — |

Never call a sheet set "character sheets" in the interface. Its sheets are named by the preset's `title` and by each sheet's name field.

## Information Architecture

| Surface | Who | Reached from | Purpose |
| --- | --- | --- | --- |
| sheet of a sheet set tab | GM; players when the sheet set is visible | Tab bar, token menu | One sheet of a sheet set |
| single sheet tab | GM; players when the single sheet is visible | Tab bar, token menu | The one sheet of a single sheet |
| Settings | GM | Gear, pinned at the right | Preset, snapshot and wipe actions, room copy status |
| Access panel | GM | "Доступ" chip in a visible sheet of a sheet set's header | Who owns the sheet and who may edit it |
| Token menu | GM, player | Owlbear's menu on a token | Open a linked sheet or repeat block, link or unlink one |
| Link picker | GM | Token menu | Choose the sheet or repeat block for a token |
| Preset builder | GM | "Конструктор пресетов" link in Settings, or its address | Make or change a preset and download it (see [Preset builder](#preset-builder)) |

There is one window. Every sheet has its own tab. Opening a target from a token opens the window on its tab, and for a repeat block scrolls to that repeat block. Settings replaces the content area (`imports/gm-nav-sketch-settings.png`).

If the active sheet disappears, or the tab is no longer available to this role, the first available tab becomes active.

## Voice and Tone

Short and literal. Commands are perfective verbs. Places are nouns. Statuses are participles, adjectives or nouns.

| Job | Copy |
| --- | --- |
| Command | "Загрузить пресет", "Скачать пресет", "Загрузить снимок", "Скачать снимок", "Очистить всё", "Добавить", "Дублировать…", "Удалить", "Привязать лист…", "Отвязать лист", "Открыть лист", "Выделить на карте", "Отменить" |
| Add a sheet of a sheet set | "+" with the accessible name "Добавить: {title}" |
| Place | "Настройки", "Доступ" |
| Status | "Ожидает", "Только чтение", "Можно править", "Токен привязан", "Нет токена" |
| Selection mark, in an accessible name only | "{name}, токен выделен" |
| Select a repeat block's tokens | "Выделить на карте" with the accessible name "Выделить блок {n} на карте", where `{n}` is the repeat block's position in its section from 1 |
| Empty sheet name | "Без имени" |
| Loading | "Загрузка…" |
| No GM | "Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку." |
| Room copy not saved | "Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок." |
| Local save failed | "Не удалось сохранить в браузере. Скачайте снимок." |
| Room copy unreadable | "Копия в комнате не читается. Дождитесь ГМ." |
| Room copy of an older format, GM | "Копия в комнате из старой версии. Очистите всё в настройках." |
| New version | "Вышла новая версия. Перезагрузите страницу." |
| Preset upload loses data | One message from the parts that apply: "Значения удалённых полей будут стёрты: {count}." "Листы будут удалены: {sheets}." then "Загрузить пресет?" |
| Preset upload removes nothing | "Формат листов изменён." |
| Snapshot import | "Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?" |
| Snapshot import drops data | Add to the import message the parts that apply: "Не войдут значения удалённых полей: {count}." "Не войдут листы: {sheets}." |
| Wipe | "Будут удалены пресет, все листы, копия в комнате и копия в этом браузере. Игроки потеряют привязки и права. Очистить всё?" |
| Delete | "Удалить «{name}»? Это нельзя отменить." |
| Bad formula | "Нельзя бросить: поле «{field}» пустое или не число" |
| Bad formula result | "Нельзя бросить: формула не дала числа" |
| Bad number | "Нужно число" |
| Bad duplicate count | "Нужно число от 1 до 50" |
| Value too long | "Слишком длинно" |
| Bad file | "Файл не подошёл: {reason}. Ничего не изменено." |
| Newer file | "Файл из более новой версии. Перезагрузите страницу." |
| No preset for a snapshot | "Сначала загрузите пресет." |
| Roll | "{roller}: {sheet}, {cell} — {result}". `{sheet}` is the sheet's name. `{cell}` is the dice cell's label: its cell name, otherwise the label before it, otherwise its formula; for a formula that rolls a dice-choice field it writes out the chosen die: `1d8 + bonus` for a cell named by its formula, `Урон (1d8)` for a cell named by a cell name or a label. `{result}` is the rolled number, and for a comparison also "успех" or "провал" |
| Edit denied | "Нет прав на правку" |
| Data replaced | "Данные комнаты заменены" |
| Guest note | "Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова." |

A sheet's name is the value of its sheet set's name field, a single sheet's name is its `title`, and an empty name shows "Без имени" everywhere a name shows.

## Component Patterns

| Component | Use | Behavioral rules |
| --- | --- | --- |
| Tab bar | All surfaces | One list of tabs in preset order, scrolling horizontally when it overflows, also with a vertical mouse wheel. Each sheet set shows its sheets in their order, followed by its "+" for the GM. Each single sheet shows one tab named by its `title`. Only the gear is pinned at the right, for the GM. A player sees only visible templates, and the player's own sheets come first, marked "вы". A token opening a tab scrolls it into view. "+" is a button outside the tab list. A tab whose sheet, or a repeat block of it, has a linked token in this client's map selection shows the selection mark, and the window does not switch tabs (CAP-32) |
| sheet of a sheet set header | sheet of a sheet set tab | Name: click to edit, for anyone who may edit the sheet. It edits the same value as the name field in the sheet. GM: "Доступ" chip on a visible sheet set, token status when the sheet set sets `tokens`, "Выделить на карте" while a linked token is on the open scene, "⋯" with "Удалить". Player: "Можно править" or "Только чтение" |
| single sheet header | single sheet tab | Title, not editable. GM: token status when the single sheet sets `tokens`, "Выделить на карте" while a linked token is on the open scene. Player: "Можно править" with `players: edit`, otherwise "Только чтение". No "Удалить" |
| New sheet | "+" | Creates a sheet of that sheet set with an empty name, opens its tab and focuses the name. The tab shows "Без имени" until a name is typed |
| Access panel | Visible sheet of a sheet set | Opens inline under the header. One row per player id, GMs excluded, from players in the room and players who already hold rights, by last known name. A radio group "Его лист" with a "Никто" option, and a checkbox "Может править" per player. Choosing an owner also turns editing on, and the GM can turn it off. Changing or clearing the owner does not change the previous owner's editing. Changes apply at once. With no players: "Пока никого нет". Shows the guest note |
| Preset cell | Sheets | `text` renders its label. `field` renders its value; a `select` or `dice-choice` field renders a picker of its options. `dice` renders a dice button. A field's accessible name is its cell name, otherwise the nearest preceding `text` cell in its row, otherwise its id. A dice button's accessible name is its cell name, otherwise its visible text: the nearest preceding `text` cell, otherwise its formula. A named field or dice cell shows its cell name in a tooltip |
| Field value | Sheets | Click to edit in place, with no edit mode. A `check` toggles and saves on one click. A `select` or `dice-choice` field saves on the pick: it offers "—" first, which clears the field, then the options in preset order, and a stored value that is no longer an option shows as a disabled extra choice until a pick replaces it. A `text` or `number` field saves on blur or after a typing pause. A blur with no change sends nothing. A bad number or too long a value stays in the field with an error under it and is not saved. Empty values show an empty editable area. A read-only value takes no focus, unless it has a cell name: then it takes focus, so its tooltip opens by keyboard or tap |
| Repeat block | Sheets | A repeat block holds every row of its section. "Добавить", under the section, adds a repeat block at the end; the section title says what is added. Its accessible name names the section: «Добавить в «{section title}»», for example «Добавить в «Атаки»». Each repeat block has "Удалить". Both show only with edit rights. GM: "Дублировать…" on each repeat block, and token status on each repeat block when the section sets `tokens`, with "Выделить на карте" while a linked token of that repeat block is on the open scene. A repeat block with a linked token in this client's map selection shows the selection mark, for players too |
| Duplicate | Repeat block | Inline number from 1 to 50, default 1. When the repeat block's first field is a `text` field with a value, a copy's value is that value without its trailing number plus the highest existing number in the section + 1. Other values are copied as is. Copies have no token. They appear at the end of the section |
| Dice cell | Sheets | Rolls on click. A bad formula shows its message under the cell and sends nothing. The message clears on the next roll or field change |
| Cell name tooltip | Sheets, preview | Only a named field or dice cell has one, for a reader and a writer alike. It shows the cell name. It opens on pointer hover after a short delay and at once on focus, by keyboard or by tap. It closes when both the pointer and the focus leave, and `Esc` closes it. It sits above the control, below it when there is no room above, and never covers the control. A screen reader hears the name once, as the accessible name. On touch a tap rolls a dice button, and the roll message carries its name |
| Roll result | Global | Owlbear notification, so it shows when the window is closed. A roll from a hidden sheet shows only on GM clients |
| Token menu | Owlbear | GM on a token with no link: "Привязать лист…". GM on a linked token: "Открыть лист" and "Отвязать лист". Player: "Открыть лист" only on tokens linked to a visible sheet or a repeat block of one. One token links to one sheet or repeat block. One target can have many tokens. The token status in the window is read-only |
| Link picker | Token menu | Small Owlbear popover. Groups in preset order, one per sheet set, single sheet or `repeat` section that sets `tokens`. A sheet set lists its sheets, a single sheet lists itself, and a section lists its repeat blocks by sheet name and the repeat block's first field. In each group, targets with no token come first. With no target: "Сначала создайте лист". Linking offers the target's name as the token label (a repeat block's first field) |
| Settings | Gear | Sections in this order: Пресет, Снимок, Копия в комнате, Очистка. Пресет ends with the "Конструктор пресетов" link, which opens the builder in a new tab, and its hint (CAP-21). Results and file errors appear under the button that caused them. "Копия в комнате" shows "Сохранена" and the used and available size, "Не сохранена" with no room copy yet, or the not-saved message. With no preset, "Скачать пресет", "Скачать снимок" and "Загрузить снимок" are disabled with "Сначала загрузите пресет." "Очистить всё" is enabled with or without a preset |
| Map selection | Tab bar, repeat block, GM header | CAP-32. Marks follow this client's own map selection through live token links of the sheets this role sees, and clear when the selection clears. "Выделить на карте" is a toggle button, GM only, pressed while every linked token of its sheet or repeat block on the open scene is selected. Pressing it adds those tokens to the map selection, or removes them when it is pressed. Tokens on other scenes are skipped. It never switches tabs or scrolls |
| Status banner | Under tab bar | One banner, only when something is wrong. Priority: local save failed, room copy not saved, room copy of an older format, new version, no GM |
| Confirmation | Upload, import, delete, wipe | One inline block for the whole action, at the top of the content area. Focus moves to "Отменить". Never one per field |

## State Patterns

| State | Surface | Treatment |
| --- | --- | --- |
| Loading | Window | Until the first catch-up ends, shows the tab bar from known data and "Загрузка…", and never an empty state |
| No preset | Window | After catch-up. GM: "Загрузить пресет" and the gear. Player with a GM online: "ГМ ещё не настроил листы." |
| No data and no GM | Player | "ГМ ещё не заходил. Листов пока нет." with the no-GM banner |
| sheet set with no sheets | Tab bar | GM sees that sheet set's "+" in its place. A player sees nothing for it |
| No visible tab | Player | "ГМ ещё не создал листы." |
| Room copy of an older format | GM | The banner names "Очистить всё" and stays until the room is wiped. No room copy is saved meanwhile |
| No GM responds | Player | Warning banner. Sheets stay readable. The edit stays visible |
| Pending edit | Player | The typed value shows at once. The "Ожидает" mark appears when the edit is unanswered after a short delay, or at once with no GM. A pending new repeat block carries the same mark. A pending removed repeat block stays dimmed with the mark |
| Edit confirmed | Player | The mark disappears. No message |
| Edit denied | Player | The value returns, with the notification |
| Access revoked during an edit | Player | The field returns to read-only and the edit is dropped, with the same notification |
| Room copy not saved | GM | Danger banner. Settings shows the same fact |
| Upload, import, download or wipe during catch-up | GM | The buttons are disabled with "Загрузка…" for the short catch-up |
| GM edit during catch-up | GM | The value shows at once, with no mark |
| Import or wipe by another GM | Any | Pending edits are dropped, with the "Данные комнаты заменены" notification |
| Value edited by another client | Sheets | Updates in place, unless that field has focus. A focused field keeps its text. `Esc` returns it to the current value |

## Interaction Primitives

- Tap and click are the same action. No hover-only control, because tablets are supported.
- Tab order: tab bar, header, then fields in preset order.
- `Enter` commits a `number` field and a single-line `text` field. `Shift+Enter` adds a line in `text`.
- `Esc` cancels an unsaved edit and returns the current value.
- No drag in the window. The builder's tree is the only place with drag (see [Preset builder](#preset-builder)).

## Accessibility Floor

- react-aria tabs: arrow keys move between tabs.
- Every field and dice button has an accessible name, as in Preset cell. A cell name also shows in its tooltip, which opens by keyboard and by tap as well as by hover.
- The status banner is a live region. Roll results use Owlbear's notification.
- Focus is visible on every control. Text contrast is at least 4.5:1 in both Owlbear themes.
- A control's touch target is at least 32 px high. This includes field rows.

## Responsive & Platform

The window opens at 600 by 600 px, confirmed by the owner in a live room, unless the preset sets `window`. Tablet and laptop behave the same.

## Key Flows

### Oleg prepares the campaign (CAP-1, CAP-3, CAP-4, CAP-5, CAP-12, CAP-14, CAP-17, CAP-18, CAP-19, CAP-29)

1. Oleg, the GM, opens the empty window and presses "Загрузить пресет". The preset has a sheet set "Персонажи" and the single sheets "NPC" (hidden) and "Инвентарь" (`players: edit`). Their tabs appear in preset order.
2. He presses the "+" after "Персонажи", types the name and fills in the sheet. The tab takes the name. The preset's aligned sections appear as one grid.
3. Liza has joined. He opens "Доступ" and marks her as the owner, and editing turns on.
4. He opens the menu on Liza's token and picks her sheet in "Привязать лист…".
5. **Climax:** Liza opens "Открыть лист" on her token, and her sheet opens.

Failure path: a file that fails validation shows the bad file message under the button, and nothing changes. Oleg can also press "Скачать пресет" to reuse it in another room.

### Oleg runs a fight with ten skeletons (CAP-6, CAP-7, CAP-14, CAP-18, CAP-30, CAP-32)

1. Oleg opens the NPC tab. Its "Противники" section is a linkable repeat section. He presses "Добавить" under it and types "Скелет 1" in the repeat block's first field.
2. He picks "Дублировать…" on that repeat block and enters 9.
3. He links each skeleton token to its repeat block through "Привязать лист…".
4. In the fight he opens "Открыть лист" on a skeleton token and lands on that skeleton's repeat block. When he clicks other skeletons on the map, their repeat blocks show the selection mark, and "Выделить на карте" on a repeat block finds its token on the map.
5. **Climax:** he changes its hits and rolls its attack, and only GM clients see the result, because NPC is hidden.

Failure path: if an attack formula uses an empty field, the bad formula message appears and nothing is sent.

### Liza plays while the GM is away (CAP-2, CAP-6, CAP-11, CAP-15)

1. Liza, on a tablet, sees her tab first, marked "вы". She sees the other sheets of "Персонажи" and "Инвентарь", and no NPC tab.
2. She presses a dice button, and everyone sees her name and result.
3. Oleg's tab freezes. Liza adds a rope to "Инвентарь", and sees the banner and "Ожидает".
4. **Climax:** Oleg returns, the banner disappears and the value is confirmed with no action from her.

Failure path: if Oleg has revoked her access to her sheet, the value returns and she sees the notification. If she closes the tab first, the edit is lost, and the banner says so.

### Oleg changes the preset mid-campaign (CAP-8)

1. Oleg presses "Скачать пресет", edits the file and presses "Загрузить пресет".
2. The extension compares it with all sheets.
3. **Climax:** one confirmation names how many values will be erased and how many sheets will be deleted, and he confirms.

If nothing is lost, the short notice appears instead. If he presses "Отменить" or the file is invalid, nothing changes.

### Oleg protects and moves the room (CAP-9, CAP-13)

1. The room copy no longer fits, and the danger banner appears.
2. Oleg opens "Настройки" and presses "Скачать пресет" and "Скачать снимок".
3. On another computer he loads the preset, then presses "Загрузить снимок".
4. **Climax:** the confirmation states what is replaced and what is dropped, and the sheets return with owners and rights reset to read.

Failure path: an invalid or newer file shows its message, and nothing changes.

### Oleg wipes a room of the old format (CAP-31)

1. Oleg opens a room he used before the sheet set and single sheet format. The banner says the room copy is from an older version.
2. He opens "Настройки" and presses "Очистить всё".
3. **Climax:** after one confirmation, the room is empty on every client, and the banner is gone. He loads a new preset.

Failure path: if he presses "Отменить", nothing changes.

### Players read with no GM (CAP-10)

1. Liza opens the room before Oleg joins.
2. **Climax:** she reads every visible sheet from the room copy, with the no-GM banner.

Failure path: with no room copy, she sees "ГМ ещё не заходил. Листов пока нет."

## Preset builder

The builder is a top-level page of the deployed site (`/builder.html`), outside the Owlbear iframe (CAP-20). A GM makes or changes a preset in it, sees the preset as the window draws it, and downloads a file that "Загрузить пресет" accepts. The builder and the room exchange a preset only by file (CAP-21). The layout reference is variant B of `.working/builder-layouts.html`. This section and `DESIGN.md` win on conflict with it. Its top bar, labels and colours are placeholders.

### Builder surfaces

| Surface | Place | Purpose |
| --- | --- | --- |
| Top bar | Full width, top | Page name, draft status, undo and redo, problem counter, "Открыть…", theme switch, "Скачать пресет" |
| Confirmation | Under the top bar | The one confirmation before the draft is replaced |
| Structure tree | Left column, top | The preset as a tree: the window, then templates, sections, rows and cells (CAP-22) |
| Form | Left column, under the tree | The properties of the item selected in the tree |
| Preview | Right column | The selected template drawn by the window's own sheet components, in a frame of the preset's window size |

The page opens straight into the editor, on the draft if one exists, otherwise on the empty preset (CAP-26). There is no start screen and no draft prompt.

### Builder copy

| Job | Copy |
| --- | --- |
| Page name | "Конструктор пресетов" |
| Settings link in the window | "Конструктор пресетов", with the hint "Откроется в новой вкладке. Готовый файл загрузите кнопкой «Загрузить пресет»." |
| Draft status | "Черновик сохранён"; when browser storage fails, "Черновик не сохраняется в этом браузере" |
| Undo, redo | "Отменить правку", "Повторить правку" |
| Problem counter | "Проблем: {n}", accessible name "Проблем: {n}. Перейти к первой"; with no problem, "Проблем нет" |
| Open menu | "Открыть…" with "Пустой пресет", "Пример: персонажи, NPC, инвентарь", "Пример: d20", "Пример: пул d6", "Файл…" |
| Theme | "Светлая тема" switch |
| Download | "Скачать пресет"; disabled with "Скачать можно, когда проблем нет." |
| Draft replacement | "Черновик будет заменён. Открыть «{name}»?" with "Открыть" and "Отменить" |
| File that fails the checks | The upload's own message, "Файл не подошёл: {reason}. Ничего не изменено.", or "Файл из более новой версии. Перезагрузите страницу." |
| Pane names | "Структура", "Превью · окно {width} × {height}" |
| Add items | "Добавить набор", "Добавить одиночный лист", "Добавить секцию", "Добавить строку", "Добавить подпись", "Добавить поле", "Добавить кубик" |
| Remove | "Удалить" at the end of each form |
| Empty preset | "Добавьте набор или одиночный лист." |
| Problem at an item | The reason of the upload's refusal message for that problem, such as "ошибка в формуле «1d20+dx»" |
| Rename result | "Формулы изменены: {n}." |
| Rename warning, preset from a file | "Значения поля «{id}» в комнате будут стёрты при загрузке пресета." For a template id: "Листы «{id}» в комнате будут удалены при загрузке пресета." |

Form labels, by item:

| Item | Labels |
| --- | --- |
| Window | "Свой размер окна"; "Ширина, px"; "Высота, px"; hint "Ширина от 360 до 1440, высота от 360 до 1080. Без своего размера окно 600 × 600." |
| Template | "Заголовок"; "Id"; "Вид": "Набор" or "Одиночный лист"; "Поле имени" (sheet set); "Видят": "Все" or "Только ГМ"; "Игроки могут править" (single sheet); "Можно привязать токен" |
| Section | "Заголовок"; "Ширина": "Вся", "1/2", "1/3"; "Колонки", empty for inline flow; "Повторяемая"; "Можно привязать токен к блоку" (repeat section only) |
| Label | "Текст" |
| Field | "Тип": "Текст", "Число", "Флажок", "Список", "Выбор кубика"; "Id — имя для формул"; hint "Встречается в формулах: {n}.". A `select` or `dice-choice` field adds "Варианты — по одному в строке": blank lines are not stored and each line is trimmed. Switching to "Список" starts with "Вариант 1" and "Вариант 2"; switching to "Выбор кубика" starts with "d4", "d6", "d8", "d10", "d12" and "d20"; "Название" with hint "Видно в подсказке. Пусто — ячейку называет подпись перед ней.", where an input with no text but spaces removes the cell name |
| Dice cell | "Формула"; hint "Например: 1d20 + str"; completion list "Поля"; "Название", as for a field |

### Builder components

| Component | Behavioral rules |
| --- | --- |
| Structure tree | react-aria `Tree`. The window is the first item. Templates follow in preset order, and each holds its sections, rows and cells. A template shows its title and its kind, a section its title or "Секция", a row "Строка {n}", a label its text, a field its id and type, a dice cell its formula. Each container ends with full-width add items that name what they add. The add items for a template sit at the end of the tree. A new item starts with defaults that pass the checks where it can, and becomes the selected item, so its form opens |
| Reorder | Drag in the tree only, with no move buttons. A section, row or cell may move into another container of its kind, including into another template. Keyboard and touch drag come from react-aria. A drop that breaks the preset rules is allowed and shows as a problem |
| Form | The form of the selected item. A change applies at once and the preview redraws at once (CAP-22). "Удалить" ends each form and asks nothing, because undo restores the item |
| Field id | A new field takes an id from the label before it in its row, transliterated and made to follow the id rules, unique in its scope, or "field" with a number (CAP-24). A label change keeps the id. The id input commits on `Enter` or when the focus leaves it. A commit renames the field: every formula that resolves to it is rewritten by whole word, a sheet set's name field follows, and "Формулы изменены: {n}." shows under the input (CAP-25). In a preset opened from a file, renaming an id that the file had adds the rename warning. `Esc` returns the input to the current id |
| Formula input | Offers the field ids the formula can resolve as completions: the ids of its own repeat section first, then the template's ids outside repeat sections. The list filters by the word at the caret. Arrow keys move in it, `Enter` or `Tab` inserts the id, `Esc` closes it |
| Preview | Tabs in preset order, as in the window. The template that holds the selected tree item is open. A sheet set shows one sample sheet with no "+", and its tab shows its name field's placeholder. A single sheet shows itself by its `title`. Each repeat section shows one sample repeat block. Fields are empty, read-only and show their placeholder. Dice cells take no roll. A click on a cell, row or section selects its item in the tree, and a click on a tab selects that template (CAP-22). The selected item is outlined |
| Empty-value placeholder | An empty field shows its field id in muted text, because the id is the name formulas use. A check shows its empty box. A select or dice-choice field shows its field id, as a text field does. A sheet set's sample tab shows its name field's id, or "Без имени" when the name field names no text field |
| Problems | The builder runs the upload's checks on every change and lists every problem, not only the first. Each problem marks its tree item and its preview cell, row or section, and the form of that item shows its message. The problem counter selects the first problem in preset order and moves the focus to its tree item (CAP-28) |
| Download | "Скачать пресет" is enabled only when `parsePresetFile` accepts the preset (CAP-28). The file is `{name}-{YYYY-MM-DD-HHmm}.json`. `{name}` is the opened file's or example's name with no earlier time suffix, or "preset" for a blank start |
| Open | "Открыть…" opens a menu. An example or a file replaces the draft after the one confirmation. The confirmation is skipped while the draft is still the empty preset, because nothing is lost. A file that fails the checks does not open and shows the upload's message under the top bar, and the draft does not change (CAP-20). Opening is one undo step |
| Draft | The builder saves the draft in its own browser storage after every change, with no command (CAP-26). It keeps one draft only. The page reads no storage of the window, which is partitioned from it |
| Undo and redo | Every change is one step: add, remove, a form change, a move, a rename with its formula rewrites, and opening (CAP-27). Typing in one input is one step until the focus leaves it or another item changes. `Ctrl`/`Cmd`+`Z` undoes and `Shift`+`Ctrl`/`Cmd`+`Z` redoes outside text inputs. Undo and redo select the changed item |
| Theme | Follows the system colour scheme on open. "Светлая тема" overrides it, and the browser remembers the choice. The preview uses the page theme |

### Builder states

| State | Treatment |
| --- | --- |
| First visit | The empty preset: the window item and the two template add items in the tree, "Добавьте набор или одиночный лист." in the preview, and one problem, so download is off |
| Return visit | The draft as it was left, with the first template selected |
| Invalid preset | Allowed. Problems show, download is off with its reason, and the preview still draws what it can |
| Draft storage fails | The draft status says so. Editing goes on |

### Builder interaction and platform

- Laptop and landscape tablet. Layout B from about 1000 px wide. Below that the preview frame scales down and keeps its proportions. No phone or portrait tablet.
- Touch works, and no action needs hover.
- Tab order: top bar, tree, form, preview.
- Tree keys come from react-aria: arrows move and expand, `Enter` acts on an add item.

### Oleg builds a preset for a second system (CAP-20 to CAP-28)

1. Oleg opens "Настройки" in the window and follows "Конструктор пресетов". The builder opens in a new tab on the empty preset.
2. He adds a sheet set "Экипаж", a section "Характеристики" with three columns, and a row with the label "Сила", a field and a dice cell. The field takes the id `sila`. The preview draws the sheet as he goes.
3. He renames `sila` to `str`. The dice cell formula `1d20 <= sila` becomes `1d20 <= str`, and "Формулы изменены: 1." shows.
4. He adds a single sheet "Инвентарь" with a repeat section of items, and drags the row "Деньги" out of the repeat section.
5. He mistypes a formula. The counter shows one problem, the cell is marked in the tree and the preview, and download is off. He presses the counter, lands on the cell and fixes it.
6. **Climax:** he presses "Скачать пресет", then "Загрузить пресет" in the window, and the room accepts the file.

Failure path: a file from another tool that fails the checks shows the upload's message, and his draft stays.

## Inspiration & Anti-patterns

- **Lifted from DummySheet:** titled sections side by side, editing by clicking a value (`imports/dummysheet-hero.png`).
- **Rejected:** a hard-coded arrangement of stats or sheets, because the preset owns it.
- **Rejected:** a fixed NPC tab. NPC is an ordinary single sheet.
- **Rejected:** an edit mode, and a confirmation per field.
- **Rejected in the builder:** editing in place on the sheet, a text markup in place of JSON, hidden field ids, and blocking edits that make the preset invalid (SPEC Non-goals).
- **From dummy-sheet, ideas only:** new items start with defaults, an add item closes each container and names what it adds, and the download name holds the preset name and the time.
