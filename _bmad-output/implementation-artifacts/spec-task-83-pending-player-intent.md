---
title: 'TASK-83: Keep pending player intent visible until settlement'
type: 'bugfix'
created: '2026-11-17'
status: 'in-progress'
route: 'dispatch'
baseline_commit: 'e53781794550125c0feab568ac55a4015c97b0b7'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-muster-roll/storage-and-sync.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A newer applied field value can replace a player's visible pending value before the edit settles, while the pending marker still names the player's intent.

**Approach:** Keep a pending field value as a display-only overlay until the engine withdraws its key. Do not change the applied replica or its conflict resolution.

## Boundaries & Constraints

**Always:** The shown record and `PendingEntry.record` use the same pending overlay. The applied replica retains the newer applied record. Preserve fragmented pending records, newer pending revisions, ordinary applied-record merging, and GM queue behavior.

**Never:** Do not change the replica merge protocol, record versions, persistence, authorization, transport, or pending command outcome policy. Do not repair the blocked TASK-79 or TASK-82 work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Remote before settlement | Pending player cell value `20`; then applied cell value `30` with a newer tuple | Shown value is `20`, pending value and `PendingEntry.record` are `20`, and `$replica` is `30` | No premature settlement |
| Withdrawal / settlement | The engine withdraws that pending key while retaining or supplying applied `30` | Shown value is `30`; no pending entry remains | Acceptance, rejection, and cancellation share this store boundary |

</frozen-after-approval>

## Code Map

- `src/ui/projection-store.ts` — `show` builds `$records`; `pendingEntries` builds `$pending`. Both currently merge a pending block with the applied block, allowing a newer applied cell tuple to replace pending display intent. Reuse one display-only overlay rule; retain `mergeRecords` for the applied replica and assembling pending fragments.
- `src/ui/block-projection.test.ts` — public `createProjectionStore`, `replaceAll`, `applyDelta`, `$records`, `$pending`, and `$replica` own the remote-before-settlement and withdrawal behavior. Existing tests cover fragmentation and newer pending revisions.

## Tasks & Acceptance

**Execution:**
- [ ] `src/ui/block-projection.test.ts` — add one public ProjectionStore regression with literal `shown20` / `pending20` / `applied30`, then assert the withdrawal state.
- [ ] `src/ui/projection-store.ts` — apply pending field intent as a display overlay for both shown and pending-entry records; leave the applied replica merge untouched.
- [ ] Run the focused owner and the changed-path full checks with durable output.

**Acceptance Criteria:**
- Given pending value `20` and applied value `30`, when the remote record arrives before settlement, then shown `20`, pending `20`, and applied `30` remain distinct.
- Given that pending key, when the engine withdraws it and supplies applied `30`, then shown `30` remains and the pending entry disappears.

## Design Notes

The incident fixes the oracle: the two input streams have distinct purposes. Pending fragments are still assembled with normal record merging. Only the window-facing record receives a field-level overlay, so replica conflict resolution stays unchanged.

## Verification

- `bun test src/ui/block-projection.test.ts src/ui/projection-store.test.ts` — expected under 1 minute; proves the calibrated public store owner and existing store behavior.
- `/Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/checks.py --cwd <checkout> --output <caller-run>/final-checks` under the prescribed `herdr-run --wait` launch — expected 8 minutes; runs format, lint, typecheck, unit, browser, and build checks at one stable SHA.

## Implementation Notes

- Actual implementation base: `e53781794550125c0feab568ac55a4015c97b0b7`. TASK-79 and TASK-82 are blocked and excluded from this baseline.

## Spec Change Log

## Review Triage Log
