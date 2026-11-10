---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - _bmad-output/specs/spec-muster-roll/stack.md
  - _bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
---

# Muster Roll - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Muster Roll, decomposing the requirements from the SPEC (the project's PRD equivalent), UX Design and Architecture requirements into implementable stories.

FR numbers equal SPEC capability numbers: FRn is CAP-n.

**Terms.** A record is `{ k, d, c, a }`: key, data, counter and author connection id. `replica` is the client's copy of the room, owned by the background page. `catching-up` is the state in which a client fetches full state before it validates or answers. A generation identifies one version of the room's data, and only a snapshot import changes it. The room copy is the compressed snapshot in room metadata. The snapshot file is the JSON file the GM downloads. They are two formats. A human gate is an acceptance criterion only the owner can complete: the agent prepares the build and a checklist, and does not deploy.

## Requirements Inventory

### Functional Requirements

- FR1: The GM can edit every character, every NPC and the preset. A GM change to any value on any sheet stays after a reload.
- FR2: Players can read the character list and cannot see NPCs. A player client shows every character, with full sheets, and shows no NPC.
- FR3: The GM can turn write access on or off per player and per character. With access on, the player's edit reaches all clients. Characters without access stay read-only for that player. With access off, the edit does not apply. Write access includes adding and removing the character's `repeat` rows.
- FR4: A JSON preset defines the character sheets and the shorter NPC sheets for any game system. One preset file holds both templates, with `text`, `field` (type `text`, `number` or `check`, stable id) and `dice` cells. A preset for a second system gives working sheets with no code change.
- FR5: The preset controls sheet layout through aligned columns, inline flow, repeated rows and section width (`1/3`, `1/2`, `full`). Rows in a `columns` section align in one grid. A `repeat` section gives each character its own number of rows. Ids resolve inside the row first, then inside the same sheet, never across characters.
- FR6: Anyone who can see a sheet can roll its dice cells. Formulas refer to fields by id and support `floor`, `ceil` and roll-under, and a check counts as 0 or 1. `1d20 <= str - 2*str_tired` with filled fields rolls once, and all connected clients show the same result with the roller's name. A roll from an NPC sheet shows only on GM clients.
- FR7: A formula with an empty, non-numeric or removed field shows an error. No roll and no broadcast occur.
- FR8: The GM can change the preset by uploading a JSON file after sheets exist, and the change applies to all sheets. A new field is empty on all sheets. A rename with the same id keeps the values. When an upload removes fields that hold values, one confirmation for the whole upload warns that the data will be lost, and the values are then erased on all sheets. Any other upload shows a short notice that the format changed.
- FR9: Room data stays after a reload and after re-entry to the room. A GM reload keeps all data. The snapshot is written when it fits. When it does not fit, it is skipped and the GM sees a notice. Room metadata never goes past the limit.
- FR10: Players can read the last snapshot when no GM is online. With no GM online and a snapshot present, a player sees the characters from it. No live edit is exchanged.
- FR11: Edits sync live between GM tabs, GM devices and players. Edits to different rows from two GM tabs both stay. Two edits of one row settle on the latest version on all clients.
- FR12: The GM can export and import the preset as a JSON file. The file holds no values. Import into another room gives the same structure.
- FR13: The GM can export and import a room snapshot as a JSON file. The file holds values and token links. Import replaces all room data after confirmation. Values of field ids not in the current preset are dropped, and the GM sees their count. Import restores a token link where the token exists. Import resets player links and write rights to read.
- FR14: A user can open a linked sheet from its token. The sheet opens for those who can already see it. An NPC sheet opens only for the GM.
- FR15: A player's edit waits for a GM client, and the player sees when none responds. With no GM client responding, the player sees a "no connection to GM" status and the edit does not apply. When a GM client responds, the edit is sent again, confirmed and applied.
- FR16: The GM can make several copies of an NPC, so that each token has its own NPC. Nine copies of one NPC give ten NPCs with the same values and numbered names. An edit to one does not change the others. A copy has no token link until the GM links one.
- FR17: The GM can create, rename and delete characters and NPCs. A new or renamed sheet shows on every client that can see it. After one confirmation, a deleted sheet disappears with its values, token links, owner and write rights.
- FR18: The GM can link a token to a sheet and remove that link. A linked token opens its sheet. A token links to one sheet, and a sheet can have many tokens. Removing a link keeps the sheet and the token.
- FR19: The GM can mark a player as the owner of a character. A character has at most one owner. The owner's client shows that character first. Choosing an owner turns on write access for that player, and the GM can turn it off.

### NonFunctional Requirements

- NFR1: Architecture. No own server in v1. Live exchange needs a GM client online.
- NFR2: Storage limit. Room metadata is under 16kB in total and is shared with other extensions. The extension checks free space before it writes, because Owlbear reports success for a write past the limit and drops it.
- NFR3: Message limit. Each broadcast message stays under the documented 16KB limit.
- NFR4: Rate limit. Sends stay under the measured limit: a burst of 30 messages passed, 25 per second per connection passed, 50 per second was refused with `RateLimitHit`. `LOCAL` messages hit the same limit.
- NFR5: Security. Formulas run through a small parser, never `eval`, because presets are shared files.
- NFR6: Security scope. A player's edit takes effect only after a GM client checks the write right. v1 protects honest clients only. NPC sheets and NPC rolls are hidden in the interface only, and any client can read the room snapshot.
- NFR7: Identity. A write right binds to the player id. A guest's id holds only in one browser. An account has one id across browsers.
- NFR8: Durability. Full data lives in the GM's browser. Room metadata holds only a compressed snapshot, and only when it fits. Until v2, only the room snapshot and manual export protect against loss of the local copy.
- NFR9: Data model. Values are stored apart from the template, by field id. A room has one preset file, and all sheets follow it.
- NFR10: Concurrency. Every GM tab and device can edit. No single editing tab exists.
- NFR11: Reliability in hidden tabs. No behavior depends on timers in a hidden GM tab. Measured timer gaps reach 60 seconds in Chrome, and a hidden Chrome tab can stop timers and messages after about 13 minutes.
- NFR12: System neutrality. The extension does not know what a stat means. The preset alone decides sheet content and arrangement.
- NFR13: Simplicity. The interface matches the simplicity of dummy-sheet. Muster Roll takes no code or storage from it.
- NFR14: Localization and theme. The interface text is Russian in v1. The interface follows the live Owlbear theme, with no separate palette.
- NFR15: Platform. One Owlbear action window on a laptop or a tablet. Phones are out of scope.
- NFR16: Capacity check. Published size figures predate the typed-field format, so snapshot size is measured again on the real format.
- NFR17: Release success signal. One real session runs with the party and NPCs kept only in the extension, and no data is lost. A preset for a second system is built without code changes.

### Additional Requirements

**Starter template: none is named. The project is greenfield, based on the sibling project `ttrpg-tools` with Vite in place of Astro. Epic 1 Story 1 scaffolds the Stack table and the Structural Seed below.**

- Scaffold with the exact versions of the Architecture Stack table: bun 1.4.4, TypeScript 7.0.2, @owlbear-rodeo/sdk 3.1.0, React 19.3.1, react-dom 19.3.1, @types/react 19.3.0, @types/react-dom 19.3.0, react-aria-components 1.22.1, nanostores 1.5.5, @nanostores/react 2.0.1, nanoid 6.0.2, Tailwind CSS 4.3.5, @tailwindcss/vite 4.3.5, zod 4.6.7, fflate 0.8.3, Vite 8.3.7, @vitejs/plugin-react 6.3.0, oxlint 1.93.0, oxlint-tsgolint 7.0.2006, oxfmt 0.78.0, lefthook 2.2.2, happy-dom 21.0.4, @happy-dom/global-registrator 21.0.4, @playwright/test 1.65.0, wrangler 4.159.0, Node 22.12 or later for Vite and wrangler.
- Structural seed: `src/core`, `src/replica`, `src/platform` with `obr/` and `mock/`, `src/ui`, `index.html` for popover and sheet views, `background.html` as replica host, `public/manifest.json`, `public/_headers`.
- Tooling: TypeScript strict with `skipLibCheck: true`. oxlint with type-aware rules and the anti-slop plugin. oxfmt. lefthook runs lint and format on pre-commit and typecheck on pre-push.
- Tests: logic through `bun test` with happy-dom. Interface through Playwright with a mock Owlbear SDK. The mock proves app logic only.
- Layering: `src/core` is pure, with no DOM or SDK. Only `src/platform/obr` imports `@owlbear-rodeo/sdk`, enforced by a lint rule. The mock adapter implements the same ports for broadcast, metadata, party, player, storage, context menu, popover, action, notification and theme.
- AD-1: all GM clients are equal. No code elects, tracks or waits for a specific GM client.
- AD-2: a record is `{ k, d, c, a }`. `d: null` is a tombstone, kept until the generation changes. Merge replaces the whole `d`. Keys are only `preset`, `sheet:{sheetId}`, `row:{sheetId}:{rowId}`, `rep:{sheetId}:{sectionId}:{instanceId}`, `acl:{sheetId}:{playerId}`, `link:{tokenId}`, `plink:{sheetId}:{playerId}`. Only `row:` and `rep:` of a `pc` sheet are writable by a player with access.
- AD-2 identifiers and values: `rowId` is the id of the first `field` in the preset row, and `sectionId` is the same for the template row of a `repeat` section. The preset schema refuses a duplicate field id within one non-repeat scope. A value is a JSON number, string or boolean by field type. An empty field has no key.
- AD-2 batches: deleting a sheet tombstones its `row:`, `rep:`, `acl:`, `link:` and `plink:` records in one batch. Copying an NPC writes new `sheet:`, `row:` and `rep:` records under a new `sheetId` at `c: 1`, with no `link:` record.
- AD-3: record A beats B when `(A.c, A.a) > (B.c, B.a)`. Only `core/merge` compares versions. A new edit takes the highest known `c` for that key, pending entries included, + 1. Device time never enters a version. One connection never emits one `(k, c, a)` with two different `d`.
- AD-4: a player never merges its own edit. The pending queue has at most one entry per key, holding a field patch, and only the newest entry is sent as `propose` and resent with backoff. A GM client validates only when not `catching-up`, merges with `c` and `a` unchanged and broadcasts `commit`. `reject` carries reason `denied` or `stale`. On `stale` the player applies its patch to the returned record, takes `c` + 1 and proposes again. `commit` beats `reject`.
- AD-5: one gate in `replica`, on channel `app.muster-roll/sync` with destination `REMOTE`, checks message type, sender role and generation before dispatch. Sender identity comes from `event.connectionId` through the party port, re-read once on a miss. A role change enters `catching-up`. Unlisted combinations are dropped.
- AD-6: `replica` alone owns `gmLink`. A client with no GM-origin message for half the timeout sends `ping`. A GM client that is not `catching-up` answers `alive` on receipt. The party list never sets `gmLink`. A hidden tab that still responds counts as online, because a frozen tab cannot respond. SPEC states the same rule.
- AD-7: a client enters `catching-up` on start, page visible, Page Lifecycle `resume`, browser `online`, role change, higher generation, and a differing `alive` digest seen twice in a row from one GM client. The digest is the XOR of a hash of `(k, c, a)` over all records. Catch-up uses `state-request` with nonce `r` and `state` messages `i of n`. A partial answer counts as no answer. Edits made during catch-up wait in the pending queue and take `c` on exit, and inputs stay enabled.
- AD-8: only a GM client that is not `catching-up` writes the snapshot under `app.muster-roll/snapshot`, after a pause in edits with jitter and when its page becomes hidden. The sequence is read, merge, encode sorted by key, deflated and base64, size check over all room metadata against 15500 UTF-8 bytes, write, immediate read-back verify. A higher `v` or an undecodable snapshot stops the write and raises a notice.
- AD-9: a room generation is `{ n, a }`, starting at `{ n: 0, a: "" }`, and only a snapshot import changes it. Import output holds records at `c: 1`, the current `preset`, all `link:` records from the file, and no `acl:` or `plink:`. A link to an absent token is inert. The importer persists the new generation, writes the snapshot, then broadcasts `reset`. If the snapshot cannot be written, the import still finishes, and the old-generation copy is removed from the room. An adopting client drops its pending queue with a notice and keeps its old copy until the new generation is complete.
- AD-9 scope: the room snapshot in metadata and the export file are two formats. Only the metadata one holds `acl:`, `plink:`, tombstones and versions.
- AD-10: only `src/replica` in the background page mutates the replica, composes `d`, mints `c` or calls room broadcast and metadata. Windows talk on `app.muster-roll/ui` with destination `LOCAL`, under schemas in `core`. Commands are intents and never carry a whole record. A window opens with `projection-request` and gets a full projection, then deltas. Handlers tolerate an echo of their own message.
- AD-11: a GM client persists a record under `mr1:{roomId}:{n}:{a}:{k}`. A write reads that key, merges and sets it in one synchronous step. A failed write raises a notice. Player clients do not persist.
- AD-12: room traffic uses `{ v, g, t, ... }` with `t` one of `commit`, `propose`, `reject`, `ping`, `alive`, `state-request`, `state`, `reset`, `roll`. Zod schemas in `core` parse every inbound message, snapshot and file. One function splits batches under 15000 UTF-8 bytes per message on either channel. A record that cannot fit one message is refused at input with an error.
- AD-12 pacing and versions: every send on both channels goes through one serial queue, starting at 50 ms spacing. `RateLimitHit` is waited out with backoff, and pending `commit` batches are coalesced by key. A message with another `v` is dropped, and a higher one makes the UI ask for a reload. A snapshot or file with a higher `v` is neither read nor overwritten. A lower one is read only through a migration in `core`.
- AD-13: the roller's `replica` evaluates the formula once and sends one `roll` with `{ id, sheetId, kind, roller, sheetName, cell, result }`. Receivers do not recompute and deduplicate by `id`. Each client shows the result through the notification port. A player shows only `kind: "pc"`. Rolls never enter records, storage or snapshots.
- AD-14: preset upload and preset import are the same path and do not change the generation. In `replica`, not while `catching-up`, one `core/preset` diff runs over the full replica and returns removed field ids that hold a value, where a key with `false` holds a value. A field moved across a `repeat` boundary counts as removed. The batch writes `preset`, moves values by field id, strips removed ids and tombstones rows that no longer exist. Every later write strips field ids absent from the current preset.
- AD-17: the production URL is `https://musterroll.2249364.xyz/` and does not change after the first real session. Deployment is a manual `wrangler deploy` of Workers static assets. `public/_headers` sends `Access-Control-Allow-Origin` for `https://www.owlbear.rodeo` and no-cache for HTML and `manifest.json`. Assets are content-hashed. A release passes one check in a live room. A rollback may not cross a `v` change.
- Conventions: views get sheets only through `core/visibility`. `core` returns results and does not throw for expected failures, and `replica` reports them through notices. A field sends on blur or after a typing pause, never per keystroke. Timers only schedule work. Files use kebab-case.
- Deferred values live in one constants module created by Story 1.4 and are tuned at the first live-room test: timeouts, pauses, delays and send spacing. AD-15 and AD-16 are retired, and their ids are not reused.

### UX Design Requirements

- UX-DR1: Implement the `DESIGN.md` tokens in the Tailwind 4 theme: all colors, typography `body`, `label-sm`, `section-heading`, `sheet-title`, rounded `sm`, `md`, `lg`, `full`, and spacing `1` to `4`.
- UX-DR2: Map colors at runtime from `OBR.theme` by the `DESIGN.md` table, including the `color-mix` tokens. Colors update in every window when the Owlbear theme changes. Hex values are fallbacks for tests and mocks only.
- UX-DR3: Use warning and danger colors only as surface and text pairs in the status banner and the pending mark. Light mode uses the `-light` tokens.
- UX-DR4: Apply the visual limits: system font only, no shadows inside the window, layers differ by tone, no color coding for game concepts, and no icons where a word fits, except the gear. Shapes follow `DESIGN.md`: tabs `md` on top corners, window `lg`, chips `full`, buttons `sm`.
- UX-DR5: Build the window layout: tab bar, optional banner, and one scrolling content area with padding `spacing-3`. Gaps are `spacing-1` inside a row, `spacing-2` between controls and `spacing-4` between sections.
- UX-DR6: Render sections as blocks that take the preset width and wrap as whole blocks. Below 480 px each section takes the full width. Rows of a `columns` section always share one grid, and the section scrolls horizontally if the grid does not fit. Section width is provisional. A change needs the owner's decision through a Backlog task and amends `preset-format.md`.
- UX-DR7: Open the window at 720 by 600 px. Tablet and laptop behave the same. Check the size in a live room in the first interface story.
- UX-DR8: Build the tab bar with react-aria tabs. Character tabs scroll horizontally on overflow, also with a vertical mouse wheel. A token opening a tab scrolls it into view. The player's own character is first and marked "вы". NPC and the gear stay pinned at the right for the GM. The GM's "+" follows the last character, scrolls with the tabs and is a button outside the tab list.
- UX-DR9: Build navigation rules: one window, characters and NPCs never share a list, Settings replaces the content area, and a token on an NPC opens the NPC tab and scrolls to that NPC. If the active sheet disappears or the tab is no longer available to this role, the first available tab becomes active.
- UX-DR10: Build the character header: name in `sheet-title`, chips, `⋯` at the end, bottom rule in `line`. GM: click to rename, "Доступ" chip, token status "Токен привязан" or "Нет токена", and "⋯" with "Удалить". Player: "Можно править" or "Только чтение".
- UX-DR11: Build new sheet creation from "+" and "Добавить NPC": creates a sheet named "Новый персонаж" or "Новый NPC", opens it and focuses the name.
- UX-DR12: Build the access panel, inline under the header on `surface-bar` with a `line` border and `md` radius. One row per player id, GMs excluded, from players in the room and players who already hold rights, by last known name. Radio group "Его персонаж" with "Никто", and checkbox "Может править" per player. Choosing an owner also turns editing on, and the GM can turn it off. Changes apply at once. With no players it shows "Пока никого нет". It shows the guest note.
- UX-DR13: Build the preset cell: `text` renders its label, `field` its value, `dice` a dice button. A field's accessible name is the nearest preceding `text` cell in its row, otherwise its id.
- UX-DR14: Build field value editing in place, with no edit mode. A `check` toggles and saves on one click. A `text` or `number` field saves on blur or after a typing pause. A blur with no change sends nothing. A bad number or too long a value stays in the field with an error under it and is not saved. Empty values show an empty editable area. Read-only values take no focus.
- UX-DR15: Style field values: even preset rows use `surface-stripe`, an editable value has a dotted underline in `line-strong`, sections use `section-heading` in `accent` with a left rule in `line`.
- UX-DR16: Build repeat rows: "Добавить строку" adds a row at the end, each row has an "Удалить" control, and both show only with edit rights.
- UX-DR17: Build the dice button: rolls on click. A bad formula shows its message under the button and sends nothing. The message clears on the next roll or field change.
- UX-DR18: Show roll results as an Owlbear notification in the form "{roller}: {sheet}, {cell} — {result}", so they show when the window is closed. An NPC roll shows only on GM clients.
- UX-DR19: Build the NPC block: name in `section-heading` with click to rename, left rule in `line`, token status, and "⋯" with "Дублировать…" and "Удалить". "Добавить NPC" is at the top of the tab. The rest comes from the short template.
- UX-DR20: Build duplicate: inline number from 1 to 50, default 1. A name is the source name without its trailing number plus the highest existing number + 1. A source with no number stays as is. Duplicates copy values, have no token and appear at the end.
- UX-DR21: Build the token menu. GM on a token with no sheet: "Привязать лист…". GM on a linked token: "Открыть лист" and "Отвязать лист". Player: "Открыть лист" only on tokens linked to a character, and nothing on an NPC token. The token status in the window is read-only.
- UX-DR22: Build the link picker as a small Owlbear popover: characters, then NPCs, with sheets with no token first. With no sheets it shows "Сначала создайте лист".
- UX-DR23: Build Settings with sections in this order: Пресет, Снимок, Копия в комнате. Results and file errors appear under the button that caused them. "Копия в комнате" shows "Сохранена" with the used and available size, or the not-saved message. With no preset, "Скачать пресет", "Скачать снимок" and "Загрузить снимок" are disabled with "Сначала загрузите пресет.". The first action is `button-primary`, the others `button-secondary`.
- UX-DR24: Build the status banner under the tab bar at full window width, as a live region. One banner shows, only when something is wrong. Priority: local save failed, room copy not saved, new version, no GM.
- UX-DR25: Build the confirmation: one inline block for the whole action, at the top of the content area, for upload, import and delete. Focus moves to "Отменить". Never one per field.
- UX-DR26: Build the loading state: until the first catch-up ends, the window shows the tab bar from known data and "Загрузка…", and never an empty state.
- UX-DR27: Build empty states. No preset, GM: "Загрузить пресет" and the gear. No preset, player with a GM online: "ГМ ещё не настроил листы.". No data and no GM: "ГМ ещё не заходил. Листов пока нет." with the no-GM banner. No characters, GM: "+", NPC and the gear. No characters, player: "ГМ ещё не создал персонажей.". No NPCs: "Добавить NPC" only.
- UX-DR28: Build the pending state for players: the typed value shows at once. The "Ожидает" mark in `label-sm` appears when the edit is unanswered after a short delay, or at once with no GM. A pending new repeat row carries the same mark. A pending removed row stays dimmed with the mark.
- UX-DR29: Build edit outcomes. Confirmed: the mark disappears with no message. Denied: the value returns with the notification "Нет прав на правку". Access revoked during an edit: the field returns to read-only and the edit is dropped, with the same notification. No GM: sheets stay readable and the edit stays visible.
- UX-DR30: Build GM catch-up states: upload and import buttons are disabled with "Загрузка…" during catch-up. A GM edit during catch-up shows at once, with no mark.
- UX-DR31: Build the import-by-another-GM state: pending edits are dropped, with the notification "Данные комнаты заменены".
- UX-DR32: Build remote update handling: a value edited by another client updates in place unless that field has focus. A focused field keeps its text, and `Esc` returns it to the current value.
- UX-DR33: Use the exact copy of the `EXPERIENCE.md` Voice and Tone table for every command, place, status, banner, confirmation and error string.
- UX-DR34: Apply input rules: tap and click are the same action, no hover-only control, no drag in v1. Disabled controls render at 50% opacity with a text reason near them.
- UX-DR35: Apply keyboard rules: tab order is tab bar, header, then fields in preset order. `Enter` commits a `number` field and a single-line `text` field. `Shift+Enter` adds a line in `text`. `Esc` cancels an unsaved edit and returns the current value.
- UX-DR36: Meet the accessibility floor: arrow keys move between tabs, every field has an accessible name, a 2 px outline in `focus` shows on every control and is never removed, text contrast is at least 4.5:1 in both Owlbear themes, and each control's touch target is at least 32 px high, field rows included.
- UX-DR37: Treat `mockups/shell.html` as a layout reference only. `EXPERIENCE.md` and `DESIGN.md` win on conflict. The mock differs in these points: it treats an owner as an editor, shows the sheet name in place of the roller in a roll, asks for a count with a browser dialog, and uses older labels.

### FR Coverage Map

- FR1: Epic 1 - GM edits every sheet and the preset, and changes stay after a reload
- FR2: Epic 2 - Players read all characters and see no NPC
- FR3: Epic 3 - GM turns write access on or off per player and character
- FR4: Epic 1 - A JSON preset defines character and short NPC sheets for any system
- FR5: Epic 1 - The preset controls columns, inline flow, repeat rows, width and id resolution
- FR6: Epic 4 - Dice cells roll, and results reach the right clients
- FR7: Epic 4 - A formula with bad input refuses to roll
- FR8: Epic 5 - A preset upload changes all existing sheets
- FR9: Epic 2 - Room data stays after reload and re-entry through the room copy
- FR10: Epic 2 - Players read the last room copy with no GM
- FR11: Epic 2 - Edits sync live between GM tabs, devices and players
- FR12: Epic 1 - GM downloads and uploads the preset file
- FR13: Epic 5 - GM downloads and uploads a room snapshot file
- FR14: Epic 4 - A linked sheet opens from its token
- FR15: Epic 3 - A player's edit waits for a GM, and the player sees when none responds
- FR16: Epic 4 - GM duplicates an NPC with numbered names
- FR17: Epic 1 - GM creates, renames and deletes characters and NPCs
- FR18: Epic 4 - GM links and unlinks tokens
- FR19: Epic 3 - GM marks the owner of a character

## Epic List

### Epic 1: GM Runs the Campaign Sheets
The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
**FRs covered:** FR1, FR4, FR5, FR12, FR17

### Epic 2: The Whole Table Sees the Same Sheets
Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
**FRs covered:** FR2, FR9, FR10, FR11

### Epic 3: Players Edit Their Own Characters
The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.
**FRs covered:** FR3, FR15, FR19

### Epic 4: Dice and Tokens at the Table
Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.
**FRs covered:** FR6, FR7, FR14, FR16, FR18

### Epic 5: Change the Format and Move the Campaign
The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.
**FRs covered:** FR8, FR13

## Epic 1: GM Runs the Campaign Sheets

The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.

### Story 1.1: Load the Empty Extension in a Live Owlbear Room

As the GM,  
I want Muster Roll to install in Owlbear from its permanent URL,  
So that every later feature reaches a real room.

**Acceptance Criteria:**

**Given** a clean checkout  
**When** dependencies install and `vite build` runs  
**Then** the installed versions equal the Architecture Stack table  
**And** the build emits the `index.html` and `background.html` entry pages, with `src/core`, `src/replica`, `src/platform/obr`, `src/platform/mock` and `src/ui` in place

**Given** a file outside `src/platform/obr`  
**When** that file imports `@owlbear-rodeo/sdk`  
**Then** lint fails

**Given** the repository hooks  
**When** a developer commits or pushes  
**Then** lefthook runs lint and format on pre-commit and typecheck on pre-push  
**And** TypeScript runs strict with `skipLibCheck: true`

**Given** the ports for broadcast, metadata, party, player, storage, context menu, popover, action, notification and theme  
**When** `bun test` and Playwright run  
**Then** both run against the mock adapter of the same ports

**Given** a manual `wrangler deploy` by the owner (human gate)  
**When** `https://musterroll.2249364.xyz/manifest.json` and the HTML pages are fetched  
**Then** responses send `Access-Control-Allow-Origin` for `https://www.owlbear.rodeo` and no-cache for HTML and `manifest.json`  
**And** other assets have content-hashed names (AD-17, NFR1)

**Given** the owner adds the manifest URL to a live Owlbear room (human gate)  
**When** the GM opens the extension  
**Then** the action window and the background page both load with no console error

### Story 1.2: See a Window That Belongs to Owlbear

As the GM,  
I want the window to follow the Owlbear theme and look like part of Owlbear,  
So that the extension does not distract from the table.

**Acceptance Criteria:**

**Given** the `DESIGN.md` tokens  
**When** the theme builds  
**Then** Tailwind exposes all colors, typography styles, radii and spacing steps (UX-DR1)  
**And** the UI uses the system font only, no shadows inside the window, no color coding for game concepts, and no icon where a word fits except the gear (UX-DR4)

**Given** a window is open  
**When** `OBR.theme` changes  
**Then** every token updates by the `DESIGN.md` runtime table with no reload, including the `color-mix` tokens (UX-DR2, NFR14)  
**And** hex values of theme-mapped tokens apply only in tests and mocks, and warning and danger tokens are fixed hex values in production

**Given** the Owlbear light theme  
**When** a warning or danger pair renders  
**Then** it uses the `-light` tokens, and text contrast is at least 4.5:1 in both themes (UX-DR3, UX-DR36)

**Given** the window shell  
**When** it renders  
**Then** it holds the tab bar, an optional banner and one scrolling content area with padding `spacing-3` (UX-DR5)  
**And** gaps use `spacing-1` inside a row, `spacing-2` between controls and `spacing-4` between sections (UX-DR5)  
**And** tabs use `md` on the top corners, the window `lg`, chips `full` and buttons `sm` (UX-DR4)  
**And** the owner confirms or adjusts the 720 by 600 px window size in a live room (human gate, UX-DR7, NFR15)

**Given** any control  
**When** it has keyboard focus  
**Then** a 2 px outline in `focus` shows, and the control's touch target is at least 32 px high (UX-DR36)

**Given** a disabled control  
**When** it renders  
**Then** it shows at 50% opacity with a text reason near it (UX-DR34)

**Given** any control  
**When** the GM uses touch or a mouse  
**Then** tap and click act the same, and no control depends on hover or drag (UX-DR34)

**Given** interface strings  
**When** a developer adds a string from the `EXPERIENCE.md` Voice and Tone table  
**Then** it comes from one copy catalog that holds the exact Russian text (UX-DR33)  
**And** on any conflict with `mockups/shell.html`, `EXPERIENCE.md` and `DESIGN.md` win (UX-DR37)

### Story 1.3: Keep the GM's Records Safe in the Browser

As the GM,  
I want every record stored in my browser with a version,  
So that a stale tab cannot overwrite newer data.

**Acceptance Criteria:**

**Given** two records of one key  
**When** `core/merge` compares them  
**Then** the record with the higher `(c, a)` wins, comparing `c` as a number and `a` as a string (AD-3)  
**And** property tests show merge is commutative, associative and idempotent

**Given** a record candidate  
**When** it is parsed  
**Then** only the AD-2 key forms are valid, and `d: null` is a tombstone  
**And** a field value is a JSON number, string or boolean, and an empty field has no key

**Given** a new edit of a key  
**When** a version is minted  
**Then** `c` is the highest known `c` for that key + 1, and device time is not part of the version  
**And** one connection never emits one `(k, c, a)` with two different `d`

**Given** a GM client writes a record  
**When** the storage port stores it  
**Then** the key is `mr1:{roomId}:{n}:{a}:{k}`, and one synchronous step reads that key, merges and sets it (AD-11)  
**And** a lower-version write from a stale tab leaves the newer stored record (FR1)

**Given** a storage write that fails  
**When** `core` or the storage port handles it  
**Then** the caller gets a result that reports the failure, and no exception is thrown for this expected case

**Given** no import has happened  
**When** a client reads the room generation  
**Then** it is `{ n: 0, a: "" }`

### Story 1.4: Own the Replica in the Background Page

As the GM,  
I want the data to live in the background page,  
So that closing the window loses nothing.

**Acceptance Criteria:**

**Given** the background page starts on a GM client  
**When** it loads  
**Then** `src/replica` merges all persisted records of the current generation (AD-10)  
**And** a stored record that fails its schema is skipped and raises the local-save notice  
**And** a player client persists nothing (AD-11)

**Given** a window opens  
**When** it sends `projection-request` on `app.muster-roll/ui` with destination `LOCAL`  
**Then** it receives a full projection, then deltas, and the projection holds records and notices, read through `core/visibility(role)` (AD-10)  
**And** `core/visibility` is a pass-through until player rules exist, and until then a player client shows only "Загрузка…"  
**And** the window repeats `projection-request` until a projection arrives, so a window that loads before the background page still gets one  
**And** a projection split across messages carries `i of n` and a sequence number, and the window buffers deltas until it is complete

**Given** a window sends a command  
**When** `replica` handles it  
**Then** the command passes a zod schema in `core` and carries an intent, never a whole record  
**And** an echo of a message causes no second effect

**Given** a window is closed  
**When** the GM opens it again  
**Then** the same data shows (FR1)

**Given** many sends on either channel  
**When** they leave the client  
**Then** one serial queue spaces them, starting at 50 ms, and `RateLimitHit` is waited out with backoff (AD-12, NFR4)  
**And** one function splits batches so each message is under 15000 UTF-8 bytes of JSON, and a record that cannot fit one message is refused at input with an error (NFR3)

**Given** any timeout, pause, delay or send spacing  
**When** code needs the value  
**Then** it reads one named constants module with stated starting values, and tests inject them

**Given** a local write fails  
**When** the projection reports the notice  
**Then** a status banner under the tab bar shows "Не удалось сохранить в браузере. Скачайте снимок." at full window width, as a live region (UX-DR24)  
**And** the banner disappears after the next successful write

### Story 1.5: Load and Download a Preset

As the GM,  
I want to upload a JSON preset and download it again,  
So that sheets fit my game system and I can reuse the format in another room.

**Acceptance Criteria:**

**Given** a room with no preset, after the first full projection has arrived  
**When** the GM opens the window  
**Then** the window shows "Загрузить пресет" and the gear (UX-DR27)  
**And** the gear replaces the content area with Settings, with the section "Пресет" (UX-DR9, UX-DR23)

**Given** a valid file with a character template and a short NPC template  
**When** the GM presses "Загрузить пресет"  
**Then** `core/preset` accepts `text`, `field` and `dice` cells, and `columns`, `repeat` and `width` sections (FR4)  
**And** the file is stored as the `preset` record, deflated and base64-encoded  
**And** the JSON keys and an annotated example preset are committed in the repository

**Given** a preset that uses one id in the character template and in the NPC template  
**When** the GM uploads it  
**Then** it is accepted, because each template and each repeat template row is its own scope

**Given** an invalid file, a duplicate field id in one non-repeat scope, or a record that cannot fit one message  
**When** the GM uploads it  
**Then** "Файл не подошёл: {reason}. Ничего не изменено." appears under the button, and no data changes

**Given** a preset with a field id that holds characters other than ASCII letters, digits and `_`, an id equal to `__proto__`, `floor`, `ceil` or a dice token such as `d20`, a repeat template row with no field, two repeat sections with one `sectionId`, rows of a `columns` section with different cell counts, an unknown `width` value or field type, a formula with a syntax error or an unknown function, or a dice term over the limits  
**When** the GM uploads it  
**Then** the same bad file message appears, and no data changes  
**And** a dice term has 1 to 100 dice and 1 to 1000 sides

**Given** a file with a higher format `v`  
**When** the GM uploads it  
**Then** "Файл из более новой версии. Перезагрузите страницу." appears under the button, and no data changes

**Given** a loaded preset  
**When** the GM presses "Скачать пресет"  
**Then** the file holds structure and no values, and carries the current `v` (FR12)  
**And** uploading that file in another room gives the same structure  
**And** a file with a lower `v` is read only through a migration in `core`

**Given** no preset is loaded  
**When** Settings renders  
**Then** "Скачать пресет" is disabled with "Сначала загрузите пресет." (UX-DR23)  
**And** the first action in each section uses `button-primary` and the others `button-secondary` (UX-DR23)

**Given** sheets already exist  
**When** Settings renders  
**Then** "Загрузить пресет" is disabled with the temporary reason "Удалите листы, чтобы заменить пресет."

### Story 1.6: Create and Name Characters

As the GM,  
I want to add and name characters in tabs,  
So that the party has a place in the room.

**Acceptance Criteria:**

**Given** a loaded preset  
**When** the GM presses "+"  
**Then** a sheet named "Новый персонаж" is created with a nanoid `sheetId`, an `order` and `kind: "pc"`, its tab opens and the name has focus (UX-DR11, FR17)

**Given** a character header on a GM client  
**When** the GM clicks the name, changes it and leaves the field  
**Then** the tab and header show the new name, and it stays after a reload (UX-DR10)  
**And** the name renders in `sheet-title` with a bottom rule in `line`

**Given** an empty, whitespace-only or too long name  
**When** the GM leaves the name field  
**Then** an empty or whitespace-only name returns the old name with nothing saved, and a too long name shows "Слишком длинно" and is not saved

**Given** more character tabs than fit  
**When** the GM scrolls horizontally or with a vertical mouse wheel  
**Then** the tabs scroll, and the gear stays pinned at the right (UX-DR8)  
**And** "+" follows the last character, scrolls with the tabs and is a button outside the tab list  
**And** tabs sort by `(order, sheetId)`, the same on every client and reload

**Given** focus in the tab list  
**When** the GM presses arrow keys  
**Then** focus moves between tabs through react-aria tabs (UX-DR36)

### Story 1.7: Delete a Sheet With One Confirmation

As the GM,  
I want to delete a sheet after one confirmation,  
So that a mistake does not cost me a character.

**Acceptance Criteria:**

**Given** a character header  
**When** the GM picks "Удалить" in "⋯"  
**Then** one inline block shows "Удалить «{name}»? Это нельзя отменить." at the top of the content area, and focus moves to "Отменить" (UX-DR25, UX-DR10)

**Given** the confirmation  
**When** the GM presses "Отменить"  
**Then** nothing changes

**Given** an open confirmation  
**When** its target disappears, the tab changes or the window closes  
**Then** the confirmation closes, and nothing is deleted

**Given** the confirmation  
**When** the GM confirms  
**Then** one batch tombstones the `sheet:` record and every `row:`, `rep:`, `acl:`, `link:` and `plink:` record of that sheet (AD-2, FR17)  
**And** the sheet does not return after a reload  
**And** a `replica` test with seeded records of every key form shows that all of them are tombstoned

**Given** the active sheet is deleted  
**When** the tab closes  
**Then** the first available tab becomes active (UX-DR9)

### Story 1.8: See a Sheet Laid Out by the Preset

As the GM,  
I want the preset to decide what a sheet shows and how it is arranged,  
So that any game system fits with no code change.

**Acceptance Criteria:**

**Given** a section with `columns`  
**When** the sheet renders  
**Then** all its rows share one grid, and the section scrolls horizontally if the grid does not fit (FR5, UX-DR6)

**Given** a section with no `columns`  
**When** the sheet renders  
**Then** its rows flow inline

**Given** sections with widths `1/3`, `1/2` or `full`  
**When** the sheet renders  
**Then** the sections flow side by side and wrap as whole blocks, and below 480 px each takes the full width (UX-DR6)  
**And** `full` is the default width, and any change to section width waits for the owner's decision through a Backlog task that also amends `preset-format.md`

**Given** preset cells  
**When** they render  
**Then** `text` renders its label, `field` its value and `dice` an inactive dice button whose label is the nearest preceding `text` cell in its row, otherwise its formula (UX-DR13)  
**And** a field's accessible name is the nearest preceding `text` cell in its row, otherwise its id

**Given** a rendered sheet  
**When** styles apply  
**Then** even preset rows use `surface-stripe`, an editable value has a dotted underline in `line-strong`, and sections use `section-heading` in `accent` with a left rule in `line` (UX-DR15)  
**And** field rows are at least 32 px high (UX-DR36)

### Story 1.9: Edit Fields in Place

As the GM,  
I want to click a value and type,  
So that a sheet stays current with no edit mode.

**Acceptance Criteria:**

**Given** a `check` field  
**When** the GM clicks it  
**Then** it toggles and saves on that click (UX-DR14)  
**And** unchecking stores `false`

**Given** a `text` or `number` field  
**When** the GM types  
**Then** the value saves on blur or after a typing pause, never per keystroke  
**And** change is measured against the value at focus, and a blur with no user change sends nothing and shows the current record value

**Given** a changed field  
**When** the tab changes or the window closes before the pause or blur  
**Then** a valid value is saved first

**Given** a changed field  
**When** it saves  
**Then** the window sends a field patch, `replica` merges it into the `row:` record, and the value stays after a reload (FR1)  
**And** a `number` value is stored as a JSON number, and a cleared field has no key (NFR9)

**Given** a `number` field with text that is not a number  
**When** the GM leaves it  
**Then** "Нужно число" shows under the field, the text stays, and nothing saves  
**And** `1,5` counts as 1.5, and `1e999` or spaces only count as not a number

**Given** a value that makes its whole record too long for one message  
**When** the GM leaves the field  
**Then** "Слишком длинно" shows under the field, the text stays, and nothing saves

**Given** an editing field  
**When** the GM presses `Enter` in a `number` or single-line `text` field  
**Then** the value commits  
**And** `Shift+Enter` adds a line in `text`, and `Esc` cancels the unsaved edit and returns the current value (UX-DR35)

**Given** a sheet  
**When** the GM presses Tab  
**Then** focus moves through the tab bar, the header, then fields in preset order (UX-DR35)

**Given** an empty value  
**When** the field renders  
**Then** it shows an empty editable area (UX-DR14)

### Story 1.10: Keep a Different Number of Rows per Character

As the GM,  
I want to add and remove rows in repeat sections,  
So that each character has its own inventory.

**Acceptance Criteria:**

**Given** a `repeat` section and edit rights  
**When** the GM presses "Добавить строку"  
**Then** a `rep:` record with a nanoid `instanceId` and an `order` is created, and the row appears at the end (UX-DR16, FR5)  
**And** other characters keep their own row counts

**Given** a repeat row  
**When** the GM presses its "Удалить"  
**Then** its record becomes a tombstone, and the row disappears

**Given** two rows with one `order`  
**When** the section renders  
**Then** the tie is broken by id, the same on every reload

**Given** a field id used inside a repeat row and elsewhere on the sheet  
**When** `core/preset` resolves that id from the row  
**Then** the id in the same row wins, then an id in the same sheet, and an id never resolves across characters (FR5)

### Story 1.11: Keep NPCs on Their Own Tab

As the GM,  
I want all NPCs on one page from the short template,  
So that I manage a fight without opening many sheets.

**Acceptance Criteria:**

**Given** a loaded preset  
**When** the GM views the tab bar  
**Then** the NPC tab and then the gear stay pinned at the right, and characters and NPCs never share a list (UX-DR8, UX-DR9)  
**And** with no characters the GM sees "+", NPC and the gear (UX-DR27)

**Given** the NPC tab with no NPCs  
**When** it renders  
**Then** it shows "Добавить NPC" only (UX-DR27)

**Given** the NPC tab  
**When** the GM presses "Добавить NPC"  
**Then** a sheet named "Новый NPC" with `kind: "npc"` is created and its name has focus (UX-DR11, FR17)

**Given** an NPC block  
**When** it renders  
**Then** it shows the name in `section-heading` with a left rule in `line`, click to rename, "⋯" with "Удалить", and the short template content, editable in place (UX-DR19, FR1)  
**And** "Удалить" uses the Story 1.7 confirmation

**Given** a `repeat` section in the NPC template  
**When** the GM adds or removes a row  
**Then** each NPC keeps its own rows (UX-DR16, FR5)

**Given** two preset fixtures for two different game systems  
**When** each is loaded in turn in a fresh room  
**Then** both give working character and NPC sheets with no code change (FR4, NFR12)

## Epic 2: The Whole Table Sees the Same Sheets

Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.

### Story 2.1: See Edits From Other GM Tabs Live

As the GM,  
I want my tabs and devices to share edits at once,  
So that any of them can be used during play.

**Acceptance Criteria:**

**Given** a GM edit  
**When** `replica` applies it  
**Then** it takes a new `c`, merges, persists and goes out as `commit` on `app.muster-roll/sync` with destination `REMOTE` (AD-4, AD-5)  
**And** pending `commit` batches are coalesced by key

**Given** two GM tabs  
**When** each edits a different row at once  
**Then** both edits stay on all clients (FR11, NFR10)

**Given** two GM tabs  
**When** both edit one row at once  
**Then** all clients settle on the same latest record (FR11)  
**And** no code elects or waits for a specific GM client (AD-1)

**Given** a GM client creates, renames or deletes a sheet  
**When** the commit arrives  
**Then** the change shows on every client that can see that sheet (FR17)  
**And** a remote delete of the active sheet activates the first available tab and closes its confirmation (UX-DR9)

**Given** an inbound room message  
**When** the gate handles it  
**Then** the sender's role and id come from `event.connectionId` through the party port, re-read once on a miss  
**And** the envelope `{ v }` is read first, then the message is parsed by a zod schema, and any combination not in the AD-5 table is dropped  
**And** "Known player" in AD-5 means any party member with a known connection id, GMs included

**Given** a message with another `v`  
**When** it arrives  
**Then** it is dropped, and a higher `v` shows the banner "Вышла новая версия. Перезагрузите страницу." (AD-12, UX-DR24)

**Given** a value edited by another client  
**When** the commit arrives  
**Then** the value updates in place unless that field has focus  
**And** a focused field keeps its text, and `Esc` returns it to the current value (UX-DR32)

### Story 2.2: Catch Up on Join and on Return

As a GM or a player,  
I want my client to get the current data when I join or come back,  
So that I never work from stale data.

**Acceptance Criteria:**

**Given** a client  
**When** it starts, a page becomes visible, Page Lifecycle `resume` fires, the browser `online` event fires, its role changes, or it sees a higher generation  
**Then** it enters `catching-up` and broadcasts `state-request` with a nonce `r` (AD-7, FR9, FR11)  
**And** a client already in `catching-up` keeps its current `r` and does not start again  
**And** a GM client first merges all its persisted records of the current generation

**Given** a GM client that is not `catching-up`  
**When** a `state-request` arrives  
**Then** it answers after a random short delay, unless it has already seen an answer to `r`  
**And** the `state` messages echo `r`, carry `i of n`, hold complete deflated records and are each under the size limit

**Given** a client in `catching-up`  
**When** it holds all `n` messages of one responder for its own `r`, or the timeout passes  
**Then** it leaves `catching-up`  
**And** a partial answer counts as no answer, and every `state` message is still merged whenever it arrives

**Given** a GM client with no other GM connection in the party  
**When** it enters `catching-up`  
**Then** it merges what it holds and leaves `catching-up` with no wait for the timeout

**Given** a GM edit during `catching-up`  
**When** the GM types  
**Then** the value shows at once with no mark, the edit waits in the pending queue and takes `c` on exit, and inputs stay enabled (UX-DR30)  
**And** the pending queue holds one field-patch entry per key, so two edits of one row combine  
**And** batch intents such as create and delete wait in order and run on exit

**Given** the first catch-up has not ended  
**When** the window renders  
**Then** it shows the tab bar from known data and "Загрузка…", and never an empty state (UX-DR26)  
**And** the role is read before any data renders

**Given** a GM client in `catching-up`  
**When** Settings renders  
**Then** upload buttons are disabled with "Загрузка…" (UX-DR30)  
**And** `replica` checks the state again when the command arrives and refuses it during `catching-up`

**Given** a client whose role changes to GM  
**When** catch-up ends  
**Then** all held records are persisted under the current generation (AD-11)

### Story 2.3: Let Players Read Every Character and No NPC

As a player,  
I want to read all characters in the room,  
So that I know the current state of the party.

**Acceptance Criteria:**

**Given** a player client after catch-up  
**When** the window renders  
**Then** a tab for every character shows with its full sheet, and no NPC, no NPC tab, no gear and no "+" show (FR2, UX-DR8)  
**And** `core/visibility` now applies the player rules, and views get sheets only through it

**Given** a player  
**When** the character header renders  
**Then** it shows "Только чтение" (UX-DR10)  
**And** read-only values take no focus (UX-DR14), and "Добавить строку" and "Удалить" do not show in repeat sections (UX-DR16)

**Given** no preset and a GM client that answered catch-up  
**When** a player opens the window  
**Then** it shows "ГМ ещё не настроил листы." (UX-DR27)

**Given** a preset and no characters  
**When** a player opens the window  
**Then** it shows "ГМ ещё не создал персонажей." (UX-DR27)

**Given** a GM client viewing the NPC tab or Settings, or with a confirmation open  
**When** its role changes to player  
**Then** the first available tab becomes active, and the confirmation closes (UX-DR9)

### Story 2.4: Show Whether a GM Is Answering

As a player,  
I want to see when no GM client responds,  
So that I do not assume the table is live.

**Acceptance Criteria:**

**Given** a client with no GM-origin message for half the timeout  
**When** the timer fires  
**Then** it sends `ping` (AD-6)

**Given** a GM client that is not `catching-up`  
**When** a `ping` arrives  
**Then** it answers `alive` on receipt with the generation and the digest, which is the XOR of a hash of `(k, c, a)` over all records

**Given** a player client, with the party list showing a GM  
**When** no GM-origin message arrives within the timeout  
**Then** `gmLink` is `offline`, and the banner shows "Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку." (UX-DR24, FR15)  
**And** `replica` alone sets `gmLink`, the party list never sets it, and the projection carries it to every window

**Given** a GM client, also one alone in the room  
**When** no other GM client answers  
**Then** it never shows the no-GM banner, because its own edits apply

**Given** a hidden GM tab that still answers  
**When** a client pings it  
**Then** `gmLink` stays `online` (NFR11)

**Given** a GM-origin message after an offline period  
**When** it arrives  
**Then** `gmLink` becomes `online`, and the banner disappears

**Given** `alive` from one GM client of the client's own generation  
**When** it shows a different digest twice in a row  
**Then** the client enters `catching-up` (AD-7)  
**And** after a completed catch-up, that GM client's digest is ignored until it changes, so a lagging GM does not cause a loop

### Story 2.5: Save a Room Copy That Survives the GM's Browser

As the GM,  
I want a compressed copy in the room,  
So that I can re-enter from another device.

**Acceptance Criteria:**

**Given** a GM client that is not `catching-up`  
**When** edits pause, with jitter, or its page becomes hidden  
**Then** it reads the snapshot under `app.muster-roll/snapshot`, merges it, encodes all records with tombstones, versions and generation, sorted by key, deflated and base64-encoded, then writes and reads back (AD-8, FR9)

**Given** all room metadata with this key replaced is over 15500 UTF-8 bytes  
**When** the size check runs  
**Then** the write is skipped, the previous snapshot stays, and the danger banner shows "Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок." (FR9, NFR2)

**Given** the read snapshot has a higher `v` or does not decode  
**When** the writer reads it  
**Then** the write stops, and the not-saved notice shows

**Given** the read snapshot has a higher generation  
**When** the writer reads it  
**Then** the writer does not merge or write, and starts AD-9 adoption

**Given** a `resume` or visibility change falls between the read and the write  
**When** the writer continues  
**Then** the write stops

**Given** a write that was skipped or stopped, or a trigger during `catching-up`  
**When** catch-up ends or the next trigger fires  
**Then** the snapshot is scheduled again

**Given** a read-back that lacks a written record at an equal or higher version and has no higher generation  
**When** verification runs  
**Then** the same notice shows

**Given** a client in catch-up  
**When** a snapshot exists  
**Then** the client merges it before it broadcasts `state-request` (AD-7)  
**And** a GM on a new device gets the data from the snapshot (FR9, NFR8)

**Given** Settings  
**When** it renders  
**Then** the section "Копия в комнате" after "Пресет" shows "Сохранена" with the used and available size, or the not-saved message (UX-DR23)

**Given** two or more active notices  
**When** the banner renders  
**Then** one shows, by priority: local save failed, room copy not saved, new version, no GM (UX-DR24)  
**And** the not-saved banner disappears after the next verified write

**Given** a synthetic party of 6 characters and 60 NPCs with Russian text in the real format  
**When** the snapshot is encoded  
**Then** its byte size is recorded in the story notes against the 15500 limit (NFR16)  
**And** if the size is over 15500 bytes or the margin is under 1500 bytes, a Backlog task is created and decided before Epic 3

### Story 2.6: Read Characters With No GM Online

As a player,  
I want to read the last room copy before the GM joins,  
So that I can prepare without waiting.

**Acceptance Criteria:**

**Given** no GM online and a room copy  
**When** a player opens the window and catch-up times out  
**Then** the player sees every character from the copy and the no-GM banner (FR10)  
**And** no NPC shows, and no live edit is exchanged

**Given** no GM online and no room copy  
**When** a player opens the window  
**Then** it shows "ГМ ещё не заходил. Листов пока нет." with the no-GM banner (UX-DR27)

**Given** no GM online and a room copy with a higher `v`  
**When** a player opens the window  
**Then** the new-version banner shows, and the copy is not read (AD-12)

**Given** no GM online and a room copy that does not decode  
**When** a player opens the window  
**Then** it shows "Копия в комнате не читается. Дождитесь ГМ." with the no-GM banner

**Given** a player reading with no GM  
**When** a GM client joins and answers  
**Then** the banner disappears and the sheets update to current data

## Epic 3: Players Edit Their Own Characters

The GM marks owners and grants write access. A player's edit takes effect after a GM client checks it, and the player sees when the edit waits.

### Story 3.1: Grant Write Access per Player and Character

As the GM,  
I want to turn editing on or off for a player on one character,  
So that only the right people change a sheet.

**Acceptance Criteria:**

**Given** a character header on a GM client  
**When** the GM presses the "Доступ" chip  
**Then** the panel opens inline under the header on `surface-bar` with a `line` border and `md` radius (UX-DR12, UX-DR10)

**Given** the panel  
**When** it renders  
**Then** it has one row per player id, GMs excluded, from players in the room and players who already hold rights, by last known name  
**And** it shows the guest note "Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова."

**Given** no players  
**When** the panel renders  
**Then** it shows "Пока никого нет"

**Given** the checkbox "Может править"  
**When** the GM changes it  
**Then** an `acl:{sheetId}:{playerId}` record is written or tombstoned at once, with the last known name (FR3, NFR7)  
**And** that player's header changes between "Можно править" and "Только чтение" (UX-DR10)

**Given** a sheet with `acl:` records  
**When** the GM deletes it  
**Then** those records are tombstoned (FR17)

### Story 3.2: Mark the Owner of a Character

As the GM,  
I want to mark which player owns a character,  
So that the player finds their character first.

**Acceptance Criteria:**

**Given** the access panel  
**When** the GM picks a player in the radio group "Его персонаж"  
**Then** a `plink:` record is written, any previous owner's record is tombstoned, and the character has at most one owner (FR19, UX-DR12)  
**And** an `acl:` record for that player is written, so editing turns on

**Given** two GM clients pick different owners at once  
**When** both `plink:` records merge  
**Then** every client treats the record with the highest `(c, a)` as the only owner (FR19)  
**And** the next owner change tombstones all other `plink:` records of that sheet

**Given** a player with an `acl:` or `plink:` record who is not in the room  
**When** the panel renders  
**Then** the player keeps a row under the last known name

**Given** a sheet with a `plink:` record  
**When** the GM deletes it  
**Then** that record is tombstoned (FR17)

**Given** a player is the owner  
**When** the GM clears "Может править" for that player  
**Then** write access is off, and the owner link stays (FR19)

**Given** the radio option "Никто"  
**When** the GM picks it  
**Then** the owner link is removed, and write access stays as it was

**Given** a character owned by player A
**When** the GM picks player B in "Его персонаж"
**Then** B becomes the owner, and A's write access stays until the GM clears it (FR19)

**Given** a player owns a character  
**When** that player's tab bar renders  
**Then** that character is first and marked "вы" (FR19, UX-DR8)  
**And** a player who owns several characters sees them first, by `(order, sheetId)`

### Story 3.3: Apply a Player's Edit After a GM Check

As a player with access,  
I want my edit to reach everyone once a GM client accepts it,  
So that sheets change only with the GM's permission.

**Acceptance Criteria:**

**Given** a player with access  
**When** the sheet renders  
**Then** the player's fields are editable

**Given** a player with access edits a field or a repeat row  
**When** the patch enters the pending queue  
**Then** the queue holds at most one entry per key, a newer edit updates the entry and raises `c`, and each key's entry is sent only in its newest version, with entries for different keys sent and resent independently (AD-4)  
**And** the player does not merge its own edit, and the projection exposes the pending queue

**Given** a GM client that is not `catching-up`  
**When** a valid `propose` with `c` above the current `c` arrives  
**Then** it merges the record with `c` and `a` unchanged and broadcasts `commit`, echoing `(k, c, a)`  
**And** a proposal identical to the current record gets the same `commit`, and two GM clients produce the same record

**Given** coalesced `commit` batches  
**When** a GM edit replaces a player's committed record in a batch  
**Then** the batch still carries the player's `(k, c, a)`, so the pending entry clears

**Given** a `commit` for an older `c` than the pending entry  
**When** it arrives  
**Then** the entry stays until a `commit` or `reject` matches its own `(k, c, a)`

**Given** a `propose` for a tombstoned or `npc` sheet, for a tombstoned `rep:` record, for a key outside the current preset, for a sheet with no access, or in a key form reserved for the GM  
**When** `core/access` checks it  
**Then** the GM client sends `reject` with reason `denied`, echoing `(k, c, a)` (FR3, NFR6)  
**And** a sender still unknown after one party re-read is dropped by the AD-5 gate, and its entry is resent

**Given** `reject` with reason `denied` that echoes the `(k, c, a)` of this client's pending entry  
**When** the player receives it  
**Then** the entry is dropped, the value returns, and the notification "Нет прав на правку" shows (UX-DR29)  
**And** a `reject` that matches no pending entry of this client is ignored

**Given** a `propose` with a low `c`  
**When** the GM client answers `reject` with reason `stale` and the current record  
**Then** the player applies its patch to that record, takes `c` + 1 and proposes again  
**And** if that record is a tombstone, the entry is dropped with the same notification

**Given** both `commit` and `reject` arrive for one edit  
**When** the player handles them  
**Then** `commit` wins  
**And** a `commit` that arrives after `denied` applies the value

**Given** a player with access  
**When** the player presses "Добавить строку" or a row's "Удалить"  
**Then** the change goes through the same path (FR3, UX-DR16)  
**And** an add entry holds `order` and cells, a remove entry holds `d: null`, and `d: null` from a player is valid only on a `rep:` key  
**And** on `stale` an add keeps its cells and a remove stays a remove

**Given** a player edits during `catching-up`  
**When** the client leaves `catching-up`  
**Then** the edit takes a fresh `c` and only then is proposed (AD-7)

**Given** a GM client in `catching-up`  
**When** a `propose` arrives  
**Then** it neither commits nor rejects (AD-4)

### Story 3.4: See When an Edit Is Waiting for a GM

As a player with access,  
I want to see that my edit has not applied yet,  
So that I know whether the sheet is current.

**Acceptance Criteria:**

**Given** a player types a change  
**When** the field updates  
**Then** the typed value shows at once (UX-DR28)  
**And** the "Ожидает" mark in `label-sm` on the warning pair appears after a short delay with no answer, or at once with no GM (UX-DR3)

**Given** no GM client responds  
**When** a player edits  
**Then** the edit does not apply to any client, the no-GM banner shows, the sheets stay readable and the edit stays visible (FR15, UX-DR29)  
**And** the entry is resent with backoff

**Given** a pending edit  
**When** a GM client responds and commits  
**Then** the mark disappears with no message and no player action (FR15, UX-DR29)

**Given** a pending new repeat row or removed repeat row  
**When** the section renders  
**Then** the new row carries the mark, and the removed row stays dimmed with the mark and has its inputs disabled (UX-DR28)

**Given** the GM revokes access during an edit  
**When** the player's client receives the change  
**Then** the field returns to read-only and the edit is dropped, with "Нет прав на правку" (UX-DR29)

## Epic 4: Dice and Tokens at the Table

Anyone who sees a sheet can roll its dice, and the right clients see the result. The GM duplicates NPCs and links tokens, and a sheet opens from its token.

### Story 4.1: Evaluate Dice Formulas Safely

As a preset author,  
I want formulas evaluated by a small parser,  
So that a shared preset cannot run code.

**Acceptance Criteria:**

**Given** the formula `1d20 <= str - 2*str_tired` and filled fields  
**When** `core/formula` evaluates it  
**Then** it returns one result with the roll, the target and the outcome (FR6)  
**And** tests with a seeded random source show the exact arithmetic

**Given** a formula with `floor` or `ceil`  
**When** it is evaluated  
**Then** the functions apply

**Given** a `check` field  
**When** a formula refers to it  
**Then** checked counts as 1, and unchecked and no key both count as 0, so an unchecked check is not an empty field

**Given** a formula id  
**When** it is resolved  
**Then** it uses the Story 1.10 resolver: same row first, then same sheet  
**And** an id that exists only inside a repeat section does not resolve from outside its row, and gives the field error

**Given** a formula with an empty, non-numeric or removed field  
**When** it is evaluated  
**Then** the result is an error naming the field, and no exception is thrown (FR7)  
**And** a `text` field counts only when its whole value is a number

**Given** a formula with a division by zero or a non-finite result  
**When** it is evaluated  
**Then** the result is an error with no field name, and no exception is thrown

**Given** the code base  
**When** lint or review runs  
**Then** `src/core/formula` uses no `eval` and no `new Function` (NFR5)

### Story 4.2: Roll a Dice Cell and Show the Result

As anyone who can see a sheet,  
I want to press a dice button,  
So that the table sees one result and I do not need to remember the rules.

**Acceptance Criteria:**

**Given** a valid dice cell  
**When** a client that can see the sheet presses its button, with or without write access  
**Then** that client's `replica` evaluates the formula once and sends one `roll` with `{ id, sheetId, kind, roller, sheetName, cell, result }` (AD-13, FR6)  
**And** the button styling follows `dice-button` (UX-DR17)

**Given** a roll from a character sheet  
**When** it arrives on all connected clients  
**Then** each client shows "{roller}: {sheet}, {cell} — {result}" through an Owlbear notification, also with the window closed (FR6, UX-DR18)  
**And** receivers do not recompute, and a duplicate `id` is ignored  
**And** the roller's own `replica` shows the result through the same `id` check, because `REMOTE` does not echo to the sender  
**And** only the background page calls the notification port  
**And** `{result}` holds the rolled number, and for a comparison also "успех" or "провал"

**Given** a roll from an NPC sheet  
**When** it arrives  
**Then** only GM clients show it (FR6, UX-DR18)

**Given** a formula with bad input  
**When** a client presses the button  
**Then** "Нельзя бросить: поле «{field}» пустое или не число" shows under the button, and no roll and no broadcast occur (FR7, UX-DR17)  
**And** the message clears on the next roll or field change

**Given** a formula error with no field name  
**When** a client presses the button  
**Then** "Нельзя бросить: формула не дала числа" shows under the button, and nothing is sent

**Given** a player with a pending edit in a referenced field  
**When** the player rolls  
**Then** the formula uses the value the player sees

**Given** any roll  
**When** it completes  
**Then** nothing about it enters records, storage or snapshots (AD-13)

### Story 4.3: Duplicate an NPC

As the GM,  
I want several copies of an NPC,  
So that each token has its own NPC.

**Acceptance Criteria:**

**Given** an NPC block  
**When** the GM picks "Дублировать…" in "⋯"  
**Then** an inline number field from 1 to 50 with default 1 opens (UX-DR19, UX-DR20)

**Given** a count that is empty, fractional, below 1 or above 50  
**When** the GM confirms  
**Then** "Нужно число от 1 до 50" shows under the field, and nothing is written

**Given** "Скелет 1" and a count of 9  
**When** the GM confirms  
**Then** nine NPCs "Скелет 2" to "Скелет 10" appear at the end with the same values (FR16)  
**And** they are new `sheet:`, `row:` and `rep:` records under new `sheetId` values at `c: 1`, with no `link:` record (AD-2)

**Given** other NPCs with higher numbers  
**When** copies are named  
**Then** numbering continues from the highest existing number + 1, and a source with no number stays as is (UX-DR20)  
**And** source "Скелет" with a count of 2 gives "Скелет 1" and "Скелет 2"

**Given** a copy  
**When** the GM edits it  
**Then** the other copies and the source do not change (FR16)

### Story 4.4: Link a Token to a Sheet

As the GM,  
I want to link a token to a sheet from its menu,  
So that the sheet is one click from the map.

**Acceptance Criteria:**

**Given** a token with no sheet  
**When** a GM opens its Owlbear menu  
**Then** "Привязать лист…" shows, and it opens a small Owlbear popover (UX-DR21, UX-DR22)  
**And** the menu item applies to one selected token only (`max: 1`)

**Given** the link picker  
**When** it renders  
**Then** it lists characters, then NPCs, with sheets with no token first  
**And** with no sheets it shows "Сначала создайте лист" (UX-DR22)

**Given** the GM picks a sheet  
**When** the link saves  
**Then** a `link:{tokenId}` record is written, a token links to one sheet, and a sheet can have many tokens (FR18)  
**And** a link to a deleted sheet is refused, and a menu treats it as no link  
**And** the read-only status in the character header and NPC block shows "Токен привязан", otherwise "Нет токена" (UX-DR10, UX-DR19)  
**And** the status and the picker order read `link:` records only, so a token absent from the room still shows as linked in v1

**Given** a linked token  
**When** the GM picks "Отвязать лист"  
**Then** the `link:` record is tombstoned, and the sheet and the token stay (FR18, UX-DR21)

**Given** the `link:` records or the client's role change  
**When** the delta arrives, also after the first catch-up  
**Then** the context menu is re-created with filters built from current records and role, because SDK filters are static and match item keys only

**Given** a sheet with a `link:` record  
**When** the GM deletes it  
**Then** that record is tombstoned (FR17)

### Story 4.5: Open a Sheet From Its Token

As a GM or a player,  
I want to open a sheet from the token on the map,  
So that I do not search through tabs in play.

**Acceptance Criteria:**

**Given** a token linked to a character  
**When** a GM or a player picks "Открыть лист"  
**Then** the window opens on that character's tab, and the tab scrolls into view (FR14, UX-DR8, UX-DR21)  
**And** when the window was closed, `replica` holds the requested tab and the projection delivers it

**Given** a token linked to an NPC  
**When** the GM picks "Открыть лист"  
**Then** the window opens the NPC tab and scrolls to that NPC (FR14, UX-DR9)

**Given** a token linked to an NPC  
**When** a player opens its menu  
**Then** "Открыть лист" does not show (FR14, UX-DR21)

**Given** a token with no link  
**When** a player opens its menu  
**Then** no Muster Roll item shows (UX-DR21)

## Epic 5: Change the Format and Move the Campaign

The GM changes the preset over existing sheets with one confirmation, and moves a campaign to another room through a snapshot file. A real session proves the release.

### Story 5.1: Change the Preset Over Existing Sheets

As the GM,  
I want to upload a changed preset after sheets exist,  
So that the format can grow during a campaign.

**Acceptance Criteria:**

**Given** sheets exist  
**When** Settings renders  
**Then** "Загрузить пресет" is enabled, and the temporary reason of Story 1.5 is gone

**Given** an upload, not while `catching-up`  
**When** `replica` runs one `core/preset` diff over the full replica  
**Then** it returns removed field ids that hold a value, a key present with `false` holds a value, and a field moved across a `repeat` boundary counts as removed (AD-14)  
**And** the diff runs per template and sheet kind, and also returns the number of stored values to erase across all sheets, which is `{count}`  
**And** a field whose type changes under one id counts as removed

**Given** removed fields with values  
**When** the diff ends  
**Then** one confirmation shows "Значения удалённых полей будут стёрты: {count}. Загрузить пресет?" with focus on "Отменить" (FR8, UX-DR25)  
**And** "Отменить" changes nothing

**Given** an open confirmation  
**When** the replica changes or `catching-up` starts  
**Then** the diff runs again, and the new count is confirmed

**Given** the confirmed upload, or an upload that removes nothing  
**When** the batch runs  
**Then** it writes `preset`, moves values by field id to the row that now holds them, strips removed ids and tombstones records of rows that no longer exist  
**And** when a repeat template's first field changes and its field ids survive, every `rep:` record is rewritten under the new `sectionId` with its `instanceId`, `order` and values, and the old key is tombstoned  
**And** moved rows are sent before `preset`  
**And** an upload that removes nothing shows "Формат листов изменён." under the button

**Given** the new preset  
**When** sheets render on all clients  
**Then** a new field is empty, and a renamed field with the same id keeps its value (FR8)  
**And** every later write strips field ids absent from the current preset

**Given** a formula that refers to a removed field  
**When** a client rolls it  
**Then** the bad formula message (Story 4.2) shows, and nothing is sent (FR7)

**Given** an upload  
**When** it finishes  
**Then** the generation has not changed (AD-14)

### Story 5.2: Download a Room Snapshot

As the GM,  
I want to download the room's data as a file,  
So that I have a copy outside my browser.

**Acceptance Criteria:**

**Given** a loaded preset  
**When** the GM presses "Скачать снимок" in the Settings section "Снимок", placed between "Пресет" and "Копия в комнате"  
**Then** a JSON file downloads with the current `v`, every live sheet with id, kind, name and order, row values, repeat rows with instance id and order, and token links (FR13, UX-DR23)  
**And** the file holds no `preset`, `acl:`, `plink:`, tombstones or versions (AD-9)

**Given** no preset  
**When** Settings renders  
**Then** "Скачать снимок" and "Загрузить снимок" are disabled with "Сначала загрузите пресет." (UX-DR23)

**Given** a GM client in `catching-up`  
**When** Settings renders  
**Then** "Скачать снимок" and "Загрузить снимок" are disabled with "Загрузка…" (UX-DR30)

### Story 5.3: Replace the Room From a Snapshot

As the GM,  
I want to load a snapshot into a room,  
So that a campaign moves to another room or computer.

**Acceptance Criteria:**

**Given** a valid file  
**When** the GM presses "Загрузить снимок"  
**Then** one confirmation shows "Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?", with "Не войдут значения удалённых полей: {count}." added when values are dropped (FR13, UX-DR25)  
**And** nothing is written before the confirmation

**Given** an invalid or newer file  
**When** the GM uploads it  
**Then** the bad file or newer file message (Story 1.5) appears under the button, and nothing changes

**Given** a file value whose type differs from the current field type  
**When** `core/snapshot` reads it  
**Then** the value is dropped and counted in `{count}`

**Given** the confirmation  
**When** the GM confirms  
**Then** the importer takes a higher generation, persists it, writes the snapshot and only then broadcasts `reset` (AD-9)  
**And** `core/snapshot` outputs records at `c: 1`, the current `preset`, all `link:` records from the file, and no `acl:` or `plink:` record

**Given** the new snapshot does not fit the 15500 limit or fails read-back  
**When** the import runs  
**Then** the import still finishes and `reset` goes out, the not-saved banner shows, and the old-generation copy is removed from the room, so players with no GM do not read replaced data

**Given** a token link in the file  
**When** the token exists in the room  
**Then** the link works, and a link to an absent token is inert (FR13)

**Given** a client sees a higher generation  
**When** it adopts it  
**Then** it drops its pending queue with the notification "Данные комнаты заменены" and runs catch-up (UX-DR31)  
**And** it keeps its old copy until the new generation is complete, then deletes it, where complete means all `n` messages of one responder or a decoded new-generation room copy  
**And** an incomplete new generation writes no snapshot, and the client repeats `state-request`

**Given** a client starts after an import  
**When** it reads its persisted records and the snapshot  
**Then** it takes the highest generation among them (AD-9)

**Given** an imported room  
**When** players view sheets  
**Then** every player is read-only and no owner is set (FR13)

### Story 5.4: Prove the Release in a Real Session

As the GM,  
I want one real session with the extension as the only record,  
So that I know the POC holds.

**Acceptance Criteria:**

**Given** a preset for a second game system, built by hand  
**When** it is loaded in a room  
**Then** working sheets appear with no code change (FR4, NFR17)

**Given** a release candidate deployed by the owner (human gate)  
**When** the release check runs in a live room  
**Then** preset upload and download, a GM edit, owner assignment, a player edit, a character roll, an NPC roll seen only by GM clients, a token open, a no-GM read, and snapshot download and import all work, because the mock proves app logic only (AD-17)

**Given** one real session with the party and NPCs kept only in the extension (human gate)  
**When** the session ends  
**Then** snapshot files from before and after the session show no lost values, and any incident is recorded in Backlog (NFR17)  
**And** deferred timeouts, pauses and spacing are confirmed or adjusted from that session
