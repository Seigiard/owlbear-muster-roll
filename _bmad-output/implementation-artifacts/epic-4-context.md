# Epic 4 Context: Dice and Tokens at the Table

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the sheets usable in play. Anyone who can see a sheet rolls its dice cells, and every client that may see the result gets one identical roll with the roller's name. A shared preset can never run code through a formula. The GM makes numbered copies of an NPC, so each token has its own NPC, links tokens to sheets from the Owlbear token menu, and a GM or player opens a linked sheet from its token. This epic adds the `roll` event to the room protocol and the token menu and link picker on top of the Epic 1 and Epic 2 replica.

## Stories

- Story 4.1: Evaluate Dice Formulas Safely
- Story 4.2: Roll a Dice Cell and Show the Result
- Story 4.3: Duplicate an NPC
- Story 4.4: Link a Token to a Sheet
- Story 4.5: Open a Sheet From Its Token

## Requirements & Constraints

- `1d20 <= str - 2*str_tired` with filled fields rolls once, and all connected clients show the same result with the roller's name. A roll from an NPC sheet shows only on GM clients. Hiding is at the interface only: players still receive NPC rolls.
- Any client that can see a sheet can roll it, with or without write access.
- A formula with an empty, non-numeric or removed field gives an error naming the field. No roll and no broadcast occur. Division by zero or a non-finite result gives an error with no field name. Expected failures return results and never throw.
- Formulas run only through the parser in `core/formula`. Never `eval` or `new Function`, because presets are shared files.
- A `check` field counts as 1 when checked, and as 0 when unchecked or absent, so it is never an empty field. A `text` field counts only when the existing number parser accepts its whole value.
- Ids resolve with the existing resolver: same row first, then same sheet, never across characters. An id that exists only inside a repeat section does not resolve from outside its row.
- Nine copies of one NPC give ten NPCs with the same values and numbered names. An edit to one copy changes no other. A copy has no token link.
- A token links to one sheet, and a sheet can have many tokens. Removing a link keeps the sheet and the token. A link to a deleted sheet is refused, and a menu treats it as no link.
- An NPC sheet opens from its token only for the GM.
- Every send, rolls included, stays under the rate and size limits through the existing send queue.

## Technical Decisions

**Formula evaluation.** Story 1.5 already parses every formula into a tree with this grammar: integer literals, field ids, `+ - * /`, parentheses, `floor()`, `ceil()`, `NdM` (N 1–100, M 1–1000, both literal) and at most one comparison from `<= < >= >`. Story 4.1 evaluates that tree. A result holds the roll, the target and the outcome. The random source is injectable, so tests with a seeded source show exact arithmetic.

**Roll event.** A window sends a roll request intent. The roller's `replica` evaluates the formula once and sends one `roll` on `app.muster-roll/sync` (`REMOTE`) with `{ id, sheetId, kind, roller, sheetName, cell, result }`. The gate accepts `roll` from any known player at any generation. Receivers do not recompute, show the names in the message as sent, and deduplicate by `id`. `REMOTE` does not echo to the sender, so the roller's own `replica` shows its roll through the same `id` check. A player shows only `kind: "pc"`. On evaluation failure nothing is sent.

**Rolls are not state.** Rolls never enter records, storage or snapshots. Only the background page calls the notification port, so a result shows with the window closed.

**Shown value.** A roll uses the value the client shows, including a queued or pending edit in a referenced field. A referenced field in an error state gives the field error and sends no roll. Field error state and unsent typing live in the window, so the roll request path must account for them.

**NPC copy.** One batch writes new `sheet:`, `row:` and `rep:` records under new nanoid `sheetId` values at `c: 1`, with no `link:` record. Copies take `order` values that place them at the end.

**Token links.** `link:{tokenId}` holds a `sheetId` and is GM-only. Unlink tombstones it. Sheet delete already tombstones `link:` records found by their `d`. The window's token status and the picker order read `link:` records only, so a token absent from the room still shows as linked in v1.

**Context menu.** Every Muster Roll token menu item applies to one selected token only (`max: 1`). SDK filters are static and match item keys only, so the menu is re-created from current records and role whenever `link:` or `sheet:` records or the role change, and after the first catch-up.

**Open from token.** When the window is closed, `replica` holds the requested tab, delivers it once to the action window, and discards it if the sheet is not visible to this role. Visibility goes through `core/visibility`.

## UX & Interaction Patterns

- A dice cell becomes a button styled by `dice-button` (accent text and border, `sm` radius, `label-sm`). Its label stays the Story 1.8 rule: the nearest preceding `text` cell in its row, otherwise the formula.
- Roll notification: "{roller}: {sheet}, {cell} — {result}". `{result}` is the rolled number, and for a comparison also "успех" or "провал".
- Errors show under the button: "Нельзя бросить: поле «{field}» пустое или не число" and "Нельзя бросить: формула не дала числа". The message clears on the next roll or field change.
- Duplicate: "Дублировать…" in the NPC block's "⋯" opens an inline number field, 1 to 50, default 1, inside an inline block on `surface-bar` with a `line` border and `md` radius. A bad count shows "Нужно число от 1 до 50" and writes nothing. No browser dialog.
- Copy names: the source name without its trailing number, plus the highest existing number + 1. A source with no number keeps its name, so "Скелет" with a count of 2 gives "Скелет 1" and "Скелет 2".
- Token menu. GM on an unlinked token: "Привязать лист…". GM on a linked token: "Открыть лист" and "Отвязать лист". Player: "Открыть лист" only on a token linked to a character. Nothing on an NPC token or an unlinked token.
- Link picker: a small Owlbear popover. Characters first, then NPCs, and in each group sheets with no token first. With no sheets: "Сначала создайте лист".
- Token status in the character header and the NPC block is read-only: "Токен привязан" or "Нет токена".
- "Открыть лист" on a character opens its tab and scrolls the tab into view. On an NPC it opens the NPC tab and scrolls to that NPC.
- The layout mock is not a source here. It shows the sheet name in place of the roller and asks for a count with a browser dialog. Both are wrong.
- Every control keeps the 2 px `focus` outline and a touch target of at least 32 px.

## Cross-Story Dependencies

- 4.2 needs 4.1. 4.5 needs 4.4. 4.3 is independent.
- Epic 1 provides the formula parse tree (1.5), the dice label (1.8), the number parser (1.9), the id resolver (1.10), sheet delete with `link:` tombstones (1.7) and the NPC block with "⋯" (1.11).
- Epic 2 provides the room gate, the send queue, catch-up and player visibility (2.3). Players can roll and open character sheets from tokens because of 2.3.
- **Epic 3 is not a blocker.** Rolling needs no write access, links and copies are GM-only writes, and opening from a token depends only on visibility. One partial dependency exists: the 4.2 rule "a roll uses the value the client shows, including a pending edit" covers player pending edits, which only exist after Story 3.3 and 3.4. Before Epic 3, only GM edits queued during catch-up can be pending, so 4.2 can prove the rule for the GM case. The player case needs a test after Epic 3. Also, `core/access` from Story 3.3 refuses a player's `propose` of a GM-only key such as `link:`. Before Epic 3, players have no write path, so no guard is needed yet.
- Epic 5 reuses the 4.2 bad formula message for a field removed by a preset change, and carries `link:` records through snapshot export and import. The release check in Story 5.4 runs a character roll, an NPC roll seen only by GM clients and a token open in a live room.
