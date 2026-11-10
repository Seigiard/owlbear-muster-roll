---
title: '1.9 Edit Fields in Place'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '51196600dbfc836017e9daac9854081bc70ab5ed'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/specs/spec-muster-roll/preset-format.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A sheet shows its values but the GM cannot change them, so a sheet cannot stay current. Backlog task: TASK-11, whose nine acceptance criteria apply in full.

**Approach:** Make every field of a character sheet editable in place with no edit mode, send a `field-patch` intent on save, and let the replica merge it into the `row:` record, or the `rep:` record for a field in an existing repeat instance.

## Boundaries & Constraints

**Always:** Only `src/replica` composes `d` and mints `c`. A patch is an intent: one field, one value or a clear. Every timeout comes from `core/timing`. Strings come from the copy catalog. A save never happens per keystroke.

**Never:** Add or remove repeat rows (Story 1.10), render NPCs (1.11), player editing or the pending mark (Epic 3), roll dice (Epic 4), or the AD-14 diff.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Check | GM clicks a `check` | Toggles and saves on that click; unchecking stores `false` | N/A |
| Typing | GM types in `text` or `number` | No command per keystroke; one save after the typing pause or on blur | N/A |
| Baseline | Blur with no change since focus or the last pause save | No command; the field shows the current record value | N/A |
| Tab change | Changed valid field, tab changed before pause or blur | Saved first | N/A |
| Window close | Changed valid field, `pagehide` | The patch is sent ahead of the spacing queue | N/A |
| Invalid on close | Invalid value, tab change or `pagehide` | Not saved | N/A |
| Stored form | Save `12` in `number`; `abc` in `text`; clear a field | Stored as JSON number 12; string `abc`; the key is removed | N/A |
| Reload | After a save | The value stays | N/A |
| Repeat cell | Field in an existing repeat instance | Saved into that `rep:` record's `cells` | N/A |
| Bad number | `abc`, `1e999`, spaces only, left | "Нужно число" under the field; text stays; nothing saved | Message |
| Number parser | `1,5`; `-2`; `+3`; `.5`; `1e3` | 1.5; -2; 3; 0.5; refused | N/A |
| Too long | A value that makes its record not fit one message, left | "Слишком длинно" under the field; text stays; nothing saved | Message |
| Enter | In `number` or `text` | Commits; focus stays | N/A |
| Shift+Enter | In `text` | Adds a line | N/A |
| Escape | Unsaved edit | Edit cancelled; current record value shown | N/A |
| Tab order | Tab from the tab bar | Tab bar, header, then every field in preset order | N/A |
| Empty | Field with no value | An empty editable area at least 32 px high | N/A |
| Remote change | Record changes while the field is not being edited | The field shows the new value | N/A |
| Command checks | Unknown or deleted sheet; field not in that row; wrong value type; unknown or deleted instance; record too large | Rejected; no data change | No throw |

</frozen-after-approval>

## Code Map

- `src/ui/sheet/preset-cell.tsx` -- read-only controls with names from `cellLabel`; `keepState` blocks the checkbox.
- `src/ui/sheet/preset-section.tsx`, `sheet-body.tsx` -- rows, repeat instances, keys by row, instance and field ids.
- `src/core/sheet-values.ts`, `src/core/preset.ts` -- value lookup, `firstFieldId`, preset types and `decodePreset`.
- `src/replica/engine.ts`, `src/core/ui-messages.ts` -- composers, rejections, `liveSheetRecord`.
- `src/platform/send-queue.ts` -- serial queue; needs a send that skips the queue.
- `src/ui/sheet/character-header.tsx` -- the pattern for a held sent value and a rejection matched by command id.
- `src/core/timing.ts`, `src/core/message-size.ts`, `src/ui/copy.ts` -- `badNumber`, `valueTooLong`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/number-input.ts` -- the one number parser -- AC 5.
- [ ] `src/core/field-patch.ts` -- the patch target, value check against the field type, and the record-fit check shared by window and engine -- AC 4, 6.
- [ ] `src/core/ui-messages.ts`, `src/replica/engine.ts` -- `field-patch` command and composer -- AC 4.
- [ ] `src/platform/send-queue.ts` -- `sendNow` that bypasses spacing and the waiting items -- AC 3.
- [ ] `src/core/timing.ts` -- `fieldSavePauseMs`, starting value 800 -- AC 2.
- [ ] `src/ui/sheet/preset-cell.tsx`, `src/ui/sheet/use-field-edit.ts`, `src/ui/main.tsx` -- editing behavior, flush on unmount and on `pagehide` -- AC 1 to 3, 5 to 9.
- [ ] Tests beside each core module, engine cases in `src/replica/engine-client.test.ts`, `tests/field-edit.e2e.ts` with real background and window pages -- every matrix row.

**Acceptance Criteria:** the nine criteria of TASK-11.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind and Edge: an untouched blur parses the shown text | high | Confirmed: a string or exponent value in a number field gave an error or a converting patch, against AC 2. Patched with a typed flag; e2e observed red. |
| Edge: a null baseline is replaced on the next keystroke | medium | Direct correction. Patched. |
| Edge: a stale error stays after an unchanged pause save | low | Direct correction. Patched. |
| Blind: one `$rejection` atom loses rejections | medium | Confirmed by reading. Patched: bounded map by command id; unit tests. |
| Blind and Edge: a held value has no end without a delta or rejection | low | Same root as the TASK-6 deferral on command delivery evidence. Carried. |
| Blind and Edge: an engine too-large rejection silently reverts typed text | medium | Confirmed. Patched: text restored with "Слишком длинно"; e2e test. |
| Blind: other rejections revert without a message | low | Only races reach them. Rejected. |
| Blind and Edge: pagehide loses queued patches and lets an older queued value win | high | Confirmed by reading. Patched with `flushNow` before urgent sends, one attempt and no backoff; close test extended. |
| Blind: hold settles early when the record already equals the value | low | Brief flash in a rare sequence. Rejected. |
| Blind: iOS decimal keypad has no minus | medium | Patched: `inputMode="text"`. |
| Blind: textarea does not grow in Firefox | medium | Patched: `rows` from the line count as a fallback. |
| Blind: field errors are not announced | medium | Patched: always-mounted polite live region. |
| Blind: `1,5` shows as `1.5` after save | low | A display choice. Listed for the owner. Rejected here. |
| Blind: no distinct reason for a missing preset | low | Rejected. |
| Blind: no unit tests for the edit hook | low | E2E covers each mode with mutations. Rejected. |
| Blind and Edge: rows 0 and 1 lost layout coverage | low | Patched. |
| Verification: stale preset cache untested | medium | Filed with a mutation. Patched; observed red. |
| Edge: IME Enter commits a half-composed value | low | Direct correction. Patched. |
| Edge: Shift+Enter in a number field does nothing | low | Direct correction. Patched. |
| Edge: `isChecked` unused | low | Direct correction. Patched. |
| Edge: field-patch comment overclaims | low | Direct correction. Patched. |
| Blind: fit test far from the limit | low | Patched with exact boundary cases. |

## Design Notes

- Command: `field-patch { sheetId, target, fieldId, value }`. `target` is `{ kind: 'row', rowId }` or `{ kind: 'rep', sectionId, instanceId }`. `value` is a JSON number, a non-empty string, a boolean, or `null` to clear.
- The engine decodes the current preset (cache by its `d`), finds the field by id in that row or repeat template row, and checks the value type: `number` takes a finite number, `text` a non-empty string, `check` a boolean. It merges into the current `d` (an absent `row:` record starts as `{}`) and mints `c`. A `rep:` target must be a live instance. A clear of an absent key sends nothing new: reject it as unchanged so no version is minted.
- Number parser: trim; empty means clear; otherwise accept `^[+-]?(\d+([.,]\d*)?|[.,]\d+)$` with `,` read as `.`, and refuse a result that is not finite. Exponents are refused. Spaces only is refused, not a clear.
- A `text` value is stored as typed, line breaks included; an empty string clears.
- Baseline is the record value at focus, reset at each pause save. A save is skipped when the parsed value equals the baseline.
- After a save the field holds the sent value until the projection brings it or a rejection with that command id arrives, as the header does.
- `text` renders as a textarea that grows with its content; Enter commits and keeps focus; Shift+Enter inserts a line. `number` renders as a text input with `inputMode="decimal"`, so `1,5` can be typed. Both keep the `aria-label` from `cellLabel` and show the error with `aria-invalid` and `aria-describedby`.
- `check` is a real checkbox in the Tab order; one click sends the patch.
- On `pagehide` the window flushes every changed valid field through `sendNow`. On unmount (tab change) it flushes through the normal queue.
- Assert `aria-multiline` (true for `text`, false or absent for `number`) in the e2e test; this closes a TASK-10 deferral.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, after a deploy: in a live room type into fields, close the window mid-typing, reopen, reload.
