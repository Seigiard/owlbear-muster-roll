---
title: '3.4 See When an Edit Is Waiting for a GM'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'c52089f43b6dca1878bdc1b097fac0d2f1384953'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-apply-a-players-edit-after-a-gm-check.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Since 3.3 a player's edit waits for a GM check, but the player cannot tell a saved value from one that waits, and a removed repeat row vanishes before the GM accepts it. Backlog task: TASK-23, whose five acceptance criteria apply in full.

**Approach:** Use the pending queue the projection already carries. A field, a new repeat row or a removed repeat row with a pending entry shows the "Ожидает" mark (`label-sm`, warning pair) after a short delay with no answer, or at once when `gmLink` is `offline`. A removed row stays in place, dimmed, with its inputs disabled, until the GM answers. Revocation during an edit returns the sheet to read-only and drops the edit with "Нет прав на правку".

## Boundaries & Constraints

**Always:** The window derives the mark only from the projection (pending entries, `gmLink`) and a window-side timer that starts when an entry appears; the delay is a timing constant (1000 ms). The mark is text, part of the field's accessible description (`aria-describedby`), not color alone. Strings from the copy catalog. The no-GM banner (2.4) is unchanged. A commit clears the mark with no message.

**Never:** New room messages or engine protocol changes beyond what revocation needs. Marks on GM clients (GM edits never wait). A message on success.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Typed | Player types a change | Value shows at once; no mark yet | N/A |
| Slow answer | No answer after 1000 ms | "Ожидает" under or beside the field | N/A |
| No GM | `gmLink` offline at the edit | Mark at once; banner shows; sheets readable; edit stays visible; resent with backoff | N/A |
| Commit | GM commits | Mark goes, no message | N/A |
| New row | Pending add | Row shows with the mark | N/A |
| Removed row | Pending remove | Row stays, dimmed, mark, inputs disabled, "Удалить" hidden or disabled | N/A |
| Remove committed | GM commits the remove | Row disappears | N/A |
| Remove denied | `denied` | Row returns to normal with the notification | N/A |
| Revoke | `acl:` tombstoned while an entry waits | Sheet returns to read-only at once; entries for that sheet dropped; values return; "Нет прав на правку" once | N/A |
| Focus | Field focused when the mark appears | Focus and caret stay | N/A |
| GM | GM window | Never shows the mark | N/A |

</frozen-after-approval>

## Code Map

- `src/core/ui-messages.ts`, `src/ui/projection-store.ts` -- pending entries in the projection.
- `src/ui/sheet/*` -- field rendering, repeat sections, rows.
- `src/replica/engine.ts`, `src/replica/proposal-queue.ts` -- drop entries on revocation.
- `src/core/timing.ts`, `src/ui/copy.ts` -- delay constant and strings.

## Tasks & Acceptance

**Execution:**
- [x] Projection/store -- expose per-key pending state and whether each entry is an add, an edit or a remove -- AC 1, 4.
- [x] `src/ui/sheet/` -- the mark with delay or at once when offline; dimmed, disabled removed rows -- AC 1 to 4.
- [x] `src/replica/engine.ts` -- on an `acl:` revocation for this player, drop that sheet's entries with one notification -- AC 5.
- [x] Tests: unit for the mark timing logic; engine for revocation; e2e for slow answer, no GM, commit clearing, new row, removed row (dimmed, disabled, then gone or restored), revoke -- every matrix row.

**Acceptance Criteria:** the five criteria of TASK-23.

## Implementation Notes

- No room or window message changes. `ProjectionStore.$pending` derives each entry from what the projection already carries: the pending view record against the replica record of its key. A tombstone is a `remove`, a `rep:` with no live applied record is an `add`, anything else is an `edit` with the changed fields and their pending values. A GM's `$pending` is always empty.
- `src/ui/pending-marks.ts` keeps the window timer per mark unit: each changed field, and each whole record. A unit is marked after `TIMING.pendingMarkDelayMs` (1000 ms) with the same pending value, so a second field or continued typing starts its own delay. A removal is marked at once. "No GM" marks at once and means `firstCatchUpDone && gmLink === 'offline'`, as the banner reads it. A shown mark stays while its value does.
- An edit marks each changed field its row shows. An edit that changes no shown field (edited back, `order` only, cells outside the template) marks the whole record: in a repeat row's slot, or on every field of a plain row.
- A repeat row's slot holds the row mark independent of "Удалить" and is a polite live region, so a removal's mark is announced once. Fields name the row mark only while the slot shows it.
- A removed row is rendered from the applied record, its cells dimmed to 50 % (the slot is not), its inputs and dice button disabled (the dice names the row mark as its reason), and its "Удалить" removed. The focus moves to the next "Удалить" or "Добавить строку". A focused text field that turns disabled saves its draft as on blur first.
- A checkbox field sits in an always-mounted wrapper so its mark can appear without remounting the input. Each character gets only its own pending entries and marks.
- Engine: after every `receiveRecords` that changes the replica (live commits and `state`), a player drops each entry that no longer passes `proposalAllowed` against the whole batch's result, waiting ones included: revoked access, deleted or NPC sheet, removed repeat row. One "Нет прав на правку" covers them. A removal of a row that is already removed drops with no notification.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Evidence |
|---|---|---|
| Blind: the mark delay is kept per record key, so a second field is marked at once | medium | Patched: delay per field or row unit; unit tests. |
| Blind and Edge: a pending entry with no changed field shows no mark | medium | Patched: row or all fields marked; e2e. |
| Edge: `gmLink` starts offline, so first catch-up edits mark at once | low | Patched: matches `bannerFor`; test. |
| Blind: row mark inside `DeleteControl` can vanish; dangling `aria-describedby` | low | Patched: separate `RowSlot`. |
| Blind: removed row dimmed with no mark during the delay; no announcement | medium | Patched: mark at once for a remove; polite live region. |
| Blind: dice button active in a removed row | low | Patched: disabled with reason. |
| Edge: a focused field disabled with unsaved text skips the flush | low | Patched: saves as on blur. No test (deferred). |
| Blind and Edge: only an `acl:` tombstone drops entries; revoke-and-regrant batch drops wrongly | medium | Patched: `dropDisallowed` after each batch; seven engine tests. |
| Verification: pending-removal focus, per-field mark, checkbox marks untested | medium | Patched: e2e; focus test observed red. |
| Blind: no-GM e2e misses no-apply and resend; delay e2e too loose | low | Patched. |
| Blind: one pending object for all sheets; import order; literal timing test | low | Patched. |
| Blind: role change and `stop()` untested | low | Patched: unit tests. |
| Blind: `TIMING` literal copied in 14 test files | low | Deferred (already in deferred-work). |

## Design Notes

- Delay: `pendingMarkDelayMs = 1000` (decided). The timer runs in the window, so a hidden background tab cannot hold it back; an entry that clears within the delay never shows the mark.
- The mark is short text "Ожидает" in `label-sm` with the warning foreground/background pair from the design tokens; reuse an existing badge or chip style if one exists.
- A removed row keeps its layout so the table does not jump; disabled inputs are not focusable.
- Revocation: the engine already denies later proposals; this story makes the player drop pending entries as soon as its replica sees its own `acl:` for the sheet tombstoned, so the edit does not wait for a GM answer.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: with the GM tab closed, a player edit shows "Ожидает" at once; reopening the GM clears it.
