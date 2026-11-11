---
title: '4.2 Roll a Dice Cell and Show the Result'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'ac8f1892f6b4505a81d5aa23cf727ebb7fdc43d0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-evaluate-dice-formulas-safely.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dice cells show a static label, and Story 4.1 can evaluate a formula, but nobody can roll. Backlog task: TASK-25, whose seven acceptance criteria apply in full.

**Approach:** Make the dice label a button. The window sends a roll intent with what it shows; the roller's `replica` evaluates once through 4.1, sends one `roll` on the room channel, and shows it; every receiving `replica` shows it once through the notification port, filtered by sheet kind and role.

## Boundaries & Constraints

**Always:** Only the background page (`replica`) calls the notification port. Evaluation runs once, in the roller's `replica`; receivers never recompute. A roll enters no record, storage or snapshot. The gate accepts `roll` from any known player at any generation (AD-5 table). Rolls go through the shared send queue. Strings come from the copy catalog (`badFormula`, `badFormulaResult`, `roll`, `rollSuccess`, `rollFailure`).

**Never:** Rolling an NPC sheet from a player client. Player write paths (Epic 3). Roll history or a roll log. `eval` or `new Function`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GM rolls a character | Valid dice cell, GM | One `roll` sent; notification "{roller}: {sheet}, {cell} — {result}" on the roller and on every other client | N/A |
| Player rolls a character | Player, read-only sheet | Same as above; no write access needed | N/A |
| NPC roll | Roll with `kind: "npc"` | Shown on GM clients only; players drop it | N/A |
| Comparison | Outcome present | `{result}` = roll, then ", успех" or ", провал" (for example "7, успех") | N/A |
| Number format | Non-integer roll | Russian number format, at most 2 decimals (for example "2,5") | N/A |
| Duplicate | Same `id` arrives twice, or the roller's own `id` | Shown once | N/A |
| Window closed | Roll arrives with no window open | Notification still shows | N/A |
| Field error | Empty, non-numeric or missing referenced field | "Нельзя бросить: поле «{field}» пустое или не число" under the button; nothing sent | N/A |
| Arithmetic error | Division by zero, non-finite, out of safe range | "Нельзя бросить: формула не дала числа" under the button; nothing sent | N/A |
| Message clears | After an error | Clears on the next press of that button or on any value change of that sheet | N/A |
| Shown value | Referenced field has unsent typing, a queued or a pending edit | Roll uses the value the client shows | N/A |
| Field in error state | Referenced field shows an input error | Field error; nothing sent | N/A |
| No state | After any roll | Records, storage and room copy unchanged | N/A |

</frozen-after-approval>

## Code Map

- `src/core/formula-evaluate.ts` -- `evaluateFormula`, `formulaFieldLookup` (4.1).
- `src/core/room-messages.ts` -- room message schemas and the gate table; add `roll`.
- `src/core/ui-messages.ts` -- window to engine intents and engine to window replies; add a roll intent and its reply.
- `src/replica/engine.ts` -- intent handling, gate dispatch, notification port use, dedup (see `core/bounded-id-set.ts`).
- `src/ui/sheet/preset-cell.tsx`, `src/ui/sheet/*` -- dice cell rendering, field local state (unsent text, error state).
- `src/core/sheet-values.ts` -- `cellLabel` (1.8 rule).
- `src/platform/mock/index.ts` -- mock notification port; tests read shown notifications from it.
- `src/ui/copy.ts` -- roll strings already exist.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/room-messages.ts` -- `roll` message `{ v, g, t: 'roll', id, sheetId, kind, roller, sheetName, cell, result }`, `result` = 4.1 `RollResult`; gate row: any known player, any generation -- AC 1, 2.
- [ ] `src/core/ui-messages.ts` -- roll intent `{ sheetId, place (section, row, cell, repeat instance id or none), shown }` where `shown` maps field id to the window's shown text or an error mark, for fields with unsent text or an input error; a reply with the outcome for the button -- AC 1, 4, 5, 6.
- [ ] `src/replica/engine.ts` -- on the intent: build values from records plus pending and queued edits plus `shown`; evaluate through 4.1; on success send one `roll` with a nanoid `id`, record the `id`, show it; on failure reply with the field label or the arithmetic failure and send nothing. On a received `roll`: drop a seen `id`, drop `kind: "npc"` on a player, else show. Format the text in one pure function in `core` -- AC 1 to 7.
- [ ] `src/ui/sheet/*` -- dice cell as a button styled by `dice-button` with the 1.8 label; message under the button from the reply; clearing rule -- AC 1, 4, 5.
- [ ] Tests: unit tests for the gate row, the text format, dedup, NPC filter, shown-value overlay; engine tests with two clients and a player; e2e with the mock room for GM roll, player roll, NPC roll hidden from a player, both error messages and their clearing, unsent typing used by a roll -- every matrix row.

**Acceptance Criteria:** the seven criteria of TASK-25.

## Implementation Notes

- The roll intent is a window message of its own, `roll-request`, not a `command`: commands are refused for a player and queued in catch-up, and a roll needs neither. The engine answers `roll-outcome` with `rolled`, `field` (with the label), `arithmetic`, `refused`, or `failed`. `refused` covers a place with no dice cell, a gone repeat row, an unknown sheet, and an NPC requested by a player. `failed` is a roll the engine could not send: no player name, a message the room would drop, or a send given up on. The window shows `rollFailed` under the button for `refused`, `failed`, and a request too large to send. The engine shows the roll and answers `rolled` only after the send succeeds (`SendQueue.enqueueReported`).
- `shown` is an object keyed by field id. The window keeps only the entry the 1.10 resolver reaches from the rolled row (`shownForRoll` in `src/ui/sheet/local-field-values.ts`), so a field of the rolled row hides a plain-row field of the same id. A field shows a local value while it holds a draft: unsent typing, focused text, or an input error.
- Evaluation, the overlay and the field label live in `src/core/dice-roll.ts` (`rollDiceCell`). The text format is `rollNotificationText` in `src/core/roll-text.ts`, which takes the copy strings as a parameter. `src/replica/background-main.ts` passes them to the engine as the `rollCopy` option, so the engine imports nothing from `src/ui`.
- The message under a button clears on the next press, or when the sheet's values signature changes after the message was shown. The signature is the versions of the sheet's `row:` and `rep:` records plus a per-sheet count of local field changes (typing, revert, an input error that comes or goes). The signature is taken when the outcome lands, so a press that saves a field on blur does not clear its own result.
- A received roll shows the name the party lists for the sender, or the message's `roller` when that name is empty. An NPC roll from a player sender is dropped.
- The engine's injected `random` now also drives the dice.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind: a player can send an NPC roll or a forged roller name that GMs show | high | Patched: receiver drops `npc` from a non-GM sender and shows the party name; engine tests. |
| Blind and Edge: the roller shows `rolled` before the send settles; a failed send is silent | medium | Patched: `enqueueReported`; `failed` reply; test. |
| Edge: a built roll message that receivers drop is still shown locally | low | Patched: parsed and size-checked before sending. |
| Edge: role change during `getName()` lets a demoted client send an NPC roll | low | Patched: re-check after the await. |
| Blind and Edge: `refused`, `too-large` and failures show nothing | medium | Patched: catalog `rollFailed` under the button. |
| Blind: double press rolls twice | medium | Patched: press ignored while pending. |
| Edge claim: AC 4 clear misses local drafts and input errors | medium | Patched: local change counter in the signature. |
| Blind: signature from hand-built prefixes and stringified `d`, costly per delta | low | Patched: record versions and key helpers. |
| Blind: roll ids share the command id sets | low | Patched: own bounded sets. |
| Blind: preset decoded on every press | low | Patched: cached by record version. |
| Blind: replica imports `@/ui/copy` | low | Patched: strings injected from `background-main.ts`. |
| Blind and Edge: request ids unbounded vs `rollSchema` | low | Patched: same bounds; 64/65 test. |
| Blind: `'-0'` string check; no grouping test | low | Patched: `signDisplay: 'negative'`; `1 000` pinned (needs `ES2023.Intl` lib). |
| Blind: message not linked to the button | low | Patched: `aria-describedby`. |
| Blind: `REJECTION_LIMIT` name | low | Renamed. |
| Verification: repeat-row and later-section dice places untested | medium | Patched with an e2e; observed red. |
| Verification: sheet-scope field label untested | low | Patched. |
| Verification: error that stays when the press saves another field untested | low | Patched with an e2e; observed red. It relies on the delta arriving before the roll reply. |
| Blind and Verification: "unsent text" e2e passes through blur-save | low | Renamed to what it checks; the overlay is covered by engine tests. |
| Edge: a blur patch rejected right before a roll leaves the roll on the old value | low | Deferred: needs the window to hold drafts until acknowledged. |
| Epic context: player pending-edit roll | low | Deferred to Epic 3, as the epic context states. |

## Design Notes

- `{field}` in the error is the referenced field's label by the 1.8 rule (`cellLabel`), or its id when the label is empty or the field is not on the sheet.
- `{roller}` is the roller's player name from the player port at roll time; `{sheet}` the sheet name at roll time; `{cell}` the dice button's label.
- A roll is allowed during catch-up; it uses the values the client shows.
- The roll intent carries `shown` only for fields the window holds locally; the engine overlays its own pending and queued edits, so a GM edit waiting in catch-up counts too. A player test for pending edits waits for Epic 3 (epic context).
- The roll `id` set is bounded like the other id sets.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: a GM and a player each roll a character with the window closed on the other side; an NPC roll shows only to GMs; an error shows under the button.
