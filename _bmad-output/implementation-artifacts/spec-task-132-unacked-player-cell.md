---
title: 'TASK-132: Keep a pending player cell from overwriting a later GM edit'
type: 'bugfix'
created: '2026-11-20'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '9cfb166ed653f329092d46e81b75c52b79833779'
review_loop_iteration: 0
context: ['{project-root}/GLOSSARY.md']
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** A GM commits a player's field edit, but the player misses the ACK. When the player edits another field of the same block, the new proposal includes the old field at a fresh version and can overwrite a later GM edit.

**Approach:** Keep the sent version and later commands separate if combining them would include an earlier sent cell. Resolve that version before proposing the later commands. Rebuild a proposal that truly lost a race, as before.

## Boundaries & Constraints

**Always:** Keep one queue entry per block key. Keep the pending view responsive, retain original commands, and build new proposals with `core/compose` in pending mode. Resend the exact unresolved version. Continue to coalesce commands that have not gone out and let a direct replacement supersede commands whose cells it replaces.

**Never:** Change the wire schema, GM-side validation or committed-version memory. Do not change the accepted limits around GM reloads or multiple GMs.

## I/O & Edge-Case Matrix

| Input / state | Expected behavior |
| --- | --- |
| The GM committed `str=11`; its ACK was lost; the GM set `str=15`; the player edits `note` on the same block before resending | The player sees the new note right away. After the original proposal gets its ACK, the later proposal contains only the new note. Both clients end with `str=15` and the new note. |
| The same second edit follows a proposal that the GM never committed | The matching `stale` reply still rebuilds the actual player intent over the current record, or reports that it cannot apply. |
| A matching ACK carries newer records, or arrives during catch-up | The later proposal uses the merged base. Commands that are ready during catch-up wait for catch-up to end. |
| A newer command directly replaces a field, or both commands precede the first send | A direct replacement still takes a newer version when it needs to beat a sent value. Two unsent field commands can still share one proposal. |

</frozen-after-approval>

## Code Map

- `src/replica/pending-edits.ts` owns command combination, composition, reply handling, overlays, catch-up, and preset rechecks. Keep the active commands and later commands separate at each of these steps.
- `src/replica/proposal-queue.ts` marks when the send queue takes a record and owns exact-version resends. Keep that moment as the boundary between an unsent batch and an already sent version.
- `src/replica/room-protocol.ts` handles the commit and its ACK. `src/replica/engine.ts` merges the commit records and rechecks access before publishing. Use the merged records when releasing later commands, without publishing an old pending view first.
- `src/core/compose.ts` already mints a sparse record from the commands it receives. Keep that composer and the GM's `receiveProposal` unchanged.
- `formal/edit-delivery/EditDelivery.tla` must represent two fields on one block key. Retain the existing one-field configs as checks and extend the code map in `.claude/skills/edit-delivery/SKILL.md`.

The pending queue keeps a fixed batch, a `record`, and later commands. Replace a batch only before its first send or when a command supersedes every cell from the sent batch. Once later commands are staged, keep that batch stable until its reply. On `stale`, rebase both command groups with the later values winning. On ACK, retain only the later commands. Preset retargeting and access checks are still required; retargeting alone does not change the wire version.

## Tasks & Acceptance

- [ ] Add a failing lost-ACK regression at the module or engine boundary. Keep or add evidence for a genuinely stale proposal.
- [ ] Split the sent commands from later commands. Resolve the sent version on an exact reply before advancing the later commands.
- [ ] Add two-field TLC checks. Add a broken variant that combines the commands as before. Read the counterexample and confirm that the fixed model passes.
- [ ] Update the edit-delivery code map and AD-4. Move the coverage sync commit after the model checks.

Given the lost-ACK sequence, when the second edit reaches the room, then it changes only the second field. Given a proposal the GM never committed, when the player receives its stale reply, then the player still retries or reports the refusal.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

- Focused pending-edit and engine tests (2 minutes). The new regression fails before the fix and passes after it.
- `formal/edit-delivery/check.sh` and `formal/drift.sh` (3 minutes). The new gate passes and its broken control produces the lost-ACK trace.
- The full changed-path checks in `CLAUDE.md`. Allow 5 minutes for format, lint, types, Bun tests, and build, 10 minutes for Chromium, and 15 minutes for the committed mutation suite. Check the other formal areas if covered wiring changes.
