---
title: 'TASK-125: Store commands in the pending edit queue'
type: 'refactor'
created: '2026-11-20'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '342fb1ad34cbbe62b9a3593b095b46430cfbe67b'
review_loop_iteration: 0
context: ['{project-root}/GLOSSARY.md']
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** A pending edit loses its row target when the replica converts it to a patch. The replica then builds its own proposal record and reconstructs commands when a player becomes a GM.

**Approach:** Keep the original player edit commands in the entry for their block key. Use `core/compose` in `pending` mode to build each proposal and return the stored commands on promotion.

## Boundaries & Constraints

**Always:** Keep one entry per key. Keep `propose` on the wire as a `VersionedRecord`. Preserve access checks, catch-up, stale replies, overlay, and resend behavior. Keep the latest minted record separate from the commands so its payload stays fixed between sends and TASK-132 can distinguish it from later commands.

**Never:** Change the room message schema, fold the replica flow modules into `engine.ts`, or fix the two-field lost-ack case tracked by TASK-132.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Combine edits | Different fields of one key, the same field twice, or a field after an add | Keep all distinct field edits, the latest command for each field, and the add before its fields | A delete replaces preceding commands |
| Rebuild | A stale reply or catch-up supplies a newer base | Use the newer base and mint one version. Send only cells from commands. Keep the add's first order and use the correct lifecycle | If no earlier version can win, drop an unchanged edit silently. Preserve denial for a gone block or a proposal that exceeds one message |
| Revert an in-flight edit | A sent version might arrive after the player restores the base value | Compose and send the restored value under a newer counter | A block already tombstoned needs no second delete |
| Change preset | A field moves rows, disappears, or no longer accepts the value | Update its row target or drop that command. A row move alone leaves the stable root key and queued wire version unchanged | Drop an entry with no valid commands silently |
| Promote | A player with pending edits becomes a GM | Return the stored commands in entry order, with an add before its field edits | Clear the queue and its timers |

</frozen-after-approval>

## Code Map

- `src/replica/pending-edits.ts` owns access preflight, minting, recheck, overlay, and promotion. Replace patch conversion, rebuild, and command reconstruction there.
- `src/replica/proposal-queue.ts` stores commands beside the version it sends. Rewrite combine, strip, and move over commands. Delete the record builder and its patch type.
- `src/core/compose.ts` already handles field edits, repeat adds, and repeat deletes. Share command checks and record construction with the pending path. For replay, check the proposal's actual delta size rather than rejecting an unrelated large cell on the base. Preserve the stricter initial preflight.
- `src/core/preset-migrate.ts` supplies row targets and repeat scope paths. Retarget the stored commands without changing the root key or resending solely for the target change.
- `src/replica/pending-edits.test.ts` owns the delivery, stale, preset change, and promotion behavior. Preserve its expectations.

## Tasks & Acceptance

**Execution:**
- [ ] Capture the engine suite JUnit identities on `origin/master` before editing source.
- [ ] Compose proposals from commands, preserving repeat order, lifecycle, and the forced no-op rule. Keep `record` as the immutable payload for the minted version.
- [ ] Port the three queue helper case groups in `src/replica/proposal-queue.test.ts`. Preserve the record assertions from the removed builder where the pending-edits suite does not already cover them.
- [ ] Update the code map in `.claude/skills/edit-delivery/SKILL.md` and stale names in `formal/edit-delivery/EditDelivery.tla`. Keep the same single-field behavior. After checking the model, move `formal/edit-delivery/coverage.txt` to the checked code commit.

**Acceptance Criteria:**
- Given a pending entry, when the replica needs a proposal, then its stored commands feed `core/compose` in `pending` mode without a `ProposalPatch`.
- Given the combine, strip, and move cases in the old queue tests, when the tests exercise commands, then they assert the same behavior.
- Given the original one-field model and the master engine JUnit baseline, when checks run on the refactor, then the model passes with its updated mapping and the engine test identities match exactly.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

- `bun test src/replica/proposal-queue.test.ts src/replica/pending-edits.test.ts` (1 minute). Queue and pending edit behavior passes.
- `bun test --reporter=junit --reporter-outfile=<file> src/replica/engine-*.test.ts` (2 minutes). Compare sorted `(file, classname, name)` tuples with the baseline.
- `formal/edit-delivery/check.sh` and `formal/drift.sh` (2 minutes). Gate and broken variants match expectations, and no model reports drift.
- The source and test check set in `CLAUDE.md`. Allow 5 minutes for format, lint, types, Bun tests, and build. Allow 10 minutes for Chromium. Run mutation checks in CI per the build workflow and locally when required by the changed-path rules.
