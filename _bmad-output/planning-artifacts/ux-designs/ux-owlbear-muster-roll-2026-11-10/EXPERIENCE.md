---
name: Muster Roll
status: final
created: 2026-11-10
updated: 2026-11-11
sources:
  - ../../../specs/spec-muster-roll/SPEC.md
  - ../../../specs/spec-muster-roll/preset-format.md
  - ../../../specs/spec-muster-roll/storage-and-sync.md
  - ../../architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
---

# Muster Roll — Experience Spine

## Foundation

One surface: the action window of an Owlbear Rodeo extension, on a laptop or a tablet. Phones are out of scope. Components use react-aria. `DESIGN.md` is the visual identity reference. The interface is Russian in v1.

The extension is system-agnostic. The preset decides which sheets exist, their content and its arrangement. This document fixes only the shell around that content. The preset builder (v2, TASK-38) is a separate page and is not covered here.

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

There is one window. Every sheet has its own tab. Opening a target from a token opens the window on its tab, and for a repeat block scrolls to that repeat block. Settings replaces the content area (`imports/gm-nav-sketch-settings.png`).

If the active sheet disappears, or the tab is no longer available to this role, the first available tab becomes active.

## Voice and Tone

Short and literal. Commands are perfective verbs. Places are nouns. Statuses are participles, adjectives or nouns.

| Job | Copy |
| --- | --- |
| Command | "Загрузить пресет", "Скачать пресет", "Загрузить снимок", "Скачать снимок", "Очистить всё", "Добавить", "Дублировать…", "Удалить", "Привязать лист…", "Отвязать лист", "Открыть лист", "Отменить" |
| Add a sheet of a sheet set | "+" with the accessible name "Добавить: {title}" |
| Place | "Настройки", "Доступ" |
| Status | "Ожидает", "Только чтение", "Можно править", "Токен привязан", "Нет токена" |
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
| Roll | "{roller}: {sheet}, {cell} — {result}". `{sheet}` is the sheet's name. `{result}` is the rolled number, and for a comparison also "успех" or "провал" |
| Edit denied | "Нет прав на правку" |
| Data replaced | "Данные комнаты заменены" |
| Guest note | "Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова." |

A sheet's name is the value of its sheet set's name field, a single sheet's name is its `title`, and an empty name shows "Без имени" everywhere a name shows.

## Component Patterns

| Component | Use | Behavioral rules |
| --- | --- | --- |
| Tab bar | All surfaces | One list of tabs in preset order, scrolling horizontally when it overflows, also with a vertical mouse wheel. Each sheet set shows its sheets in their order, followed by its "+" for the GM. Each single sheet shows one tab named by its `title`. Only the gear is pinned at the right, for the GM. A player sees only visible templates, and the player's own sheets come first, marked "вы". A token opening a tab scrolls it into view. "+" is a button outside the tab list |
| sheet of a sheet set header | sheet of a sheet set tab | Name: click to edit, for anyone who may edit the sheet. It edits the same value as the name field in the sheet. GM: "Доступ" chip on a visible sheet set, token status when the sheet set sets `tokens`, "⋯" with "Удалить". Player: "Можно править" or "Только чтение" |
| single sheet header | single sheet tab | Title, not editable. GM: token status when the single sheet sets `tokens`. Player: "Можно править" with `players: edit`, otherwise "Только чтение". No "Удалить" |
| New sheet | "+" | Creates a sheet of that sheet set with an empty name, opens its tab and focuses the name. The tab shows "Без имени" until a name is typed |
| Access panel | Visible sheet of a sheet set | Opens inline under the header. One row per player id, GMs excluded, from players in the room and players who already hold rights, by last known name. A radio group "Его лист" with a "Никто" option, and a checkbox "Может править" per player. Choosing an owner also turns editing on, and the GM can turn it off. Changing or clearing the owner does not change the previous owner's editing. Changes apply at once. With no players: "Пока никого нет". Shows the guest note |
| Preset cell | Sheets | `text` renders its label. `field` renders its value. `dice` renders a dice button. A field's accessible name is the nearest preceding `text` cell in its row, otherwise its id |
| Field value | Sheets | Click to edit in place, with no edit mode. A `check` toggles and saves on one click. A `text` or `number` field saves on blur or after a typing pause. A blur with no change sends nothing. A bad number or too long a value stays in the field with an error under it and is not saved. Empty values show an empty editable area. Read-only values take no focus |
| Repeat block | Sheets | A repeat block holds every row of its section. "Добавить", under the section, adds a repeat block at the end; the section title says what is added. Its accessible name names the section: «Добавить в «{section title}»», for example «Добавить в «Атаки»». Each repeat block has "Удалить". Both show only with edit rights. GM: "Дублировать…" on each repeat block, and token status on each repeat block when the section sets `tokens` |
| Duplicate | Repeat block | Inline number from 1 to 50, default 1. When the repeat block's first field is a `text` field with a value, a copy's value is that value without its trailing number plus the highest existing number in the section + 1. Other values are copied as is. Copies have no token. They appear at the end of the section |
| Dice cell | Sheets | Rolls on click. A bad formula shows its message under the cell and sends nothing. The message clears on the next roll or field change |
| Roll result | Global | Owlbear notification, so it shows when the window is closed. A roll from a hidden sheet shows only on GM clients |
| Token menu | Owlbear | GM on a token with no link: "Привязать лист…". GM on a linked token: "Открыть лист" and "Отвязать лист". Player: "Открыть лист" only on tokens linked to a visible sheet or a repeat block of one. One token links to one sheet or repeat block. One target can have many tokens. The token status in the window is read-only |
| Link picker | Token menu | Small Owlbear popover. Groups in preset order, one per sheet set, single sheet or `repeat` section that sets `tokens`. A sheet set lists its sheets, a single sheet lists itself, and a section lists its repeat blocks by sheet name and the repeat block's first field. In each group, targets with no token come first. With no target: "Сначала создайте лист". Linking offers the target's name as the token label (a repeat block's first field) |
| Settings | Gear | Sections in this order: Пресет, Снимок, Копия в комнате, Очистка. Results and file errors appear under the button that caused them. "Копия в комнате" shows "Сохранена" and the used and available size, "Не сохранена" with no room copy yet, or the not-saved message. With no preset, "Скачать пресет", "Скачать снимок" and "Загрузить снимок" are disabled with "Сначала загрузите пресет." "Очистить всё" is enabled with or without a preset |
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
- No drag in v1.

## Accessibility Floor

- react-aria tabs: arrow keys move between tabs.
- Every field has an accessible name, as in Preset cell.
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

### Oleg runs a fight with ten skeletons (CAP-6, CAP-7, CAP-14, CAP-18, CAP-30)

1. Oleg opens the NPC tab. Its "Противники" section is a linkable repeat section. He presses "Добавить" under it and types "Скелет 1" in the repeat block's first field.
2. He picks "Дублировать…" on that repeat block and enters 9.
3. He links each skeleton token to its repeat block through "Привязать лист…".
4. In the fight he opens "Открыть лист" on a skeleton token and lands on that skeleton's repeat block.
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

## Inspiration & Anti-patterns

- **Lifted from DummySheet:** titled sections side by side, editing by clicking a value (`imports/dummysheet-hero.png`).
- **Rejected:** a hard-coded arrangement of stats or sheets, because the preset owns it.
- **Rejected:** a fixed NPC tab. NPC is an ordinary single sheet.
- **Rejected:** an edit mode, and a confirmation per field.
