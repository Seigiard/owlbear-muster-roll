---
title: 'TASK-132: Keep a pending player cell from overwriting a later GM edit'
type: 'bugfix'
created: '2026-11-20'
status: 'done'
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

- [x] Add a failing lost-ACK regression at the module or engine boundary. Keep or add evidence for a genuinely stale proposal.
- [x] Split the sent commands from later commands. Resolve the sent version on an exact reply before advancing the later commands.
- [x] Add two-field TLC checks. Add a broken variant that combines the commands as before. Read the counterexample and confirm that the fixed model passes.
- [x] Update the edit-delivery code map and AD-4. Move the coverage sync commit after the model checks.

Given the lost-ACK sequence, when the second edit reaches the room, then it changes only the second field. Given a proposal the GM never committed, when the player receives its stale reply, then the player still retries or reports the refusal.

## Implementation Notes

- The lost-ACK engine test failed before the fix: both clients showed `str=11` after delivering the note. With the fix, both keep the GM's `str=15`. The stale-reply test confirms that a proposal the GM did not commit still retries.
- A staged view has its own projection identity, so an ACK clears the old field from the player window before the next ACK. Catch-up still combines unsent commands, including a player's explicit restore.
- The fixed model passed four gates. All nine broken controls failed as expected. `FoldsUnackedCells` reproduced the lost-ACK replay in 11 steps. `StaleLosesActive` showed that losing `str` is an error even when `note` survives. All four coverage checks passed.
- Format, lint, typecheck, and build passed. Bun passed 3,672 tests with one existing environment skip. Chromium passed 588 tests under Node 26.13.1. All 55 mutants were killed.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Result |
| --- | --- | --- |
| Preset removal dropped a staged edit on another field | High, fixed | The new engine test saw `str=10` and no proposal. The surviving command now proposes `str=11` without the removed note. |
| `NoSilentLoss` accepted another field as a witness | Medium, fixed | The property now checks the same field. `StaleLosesActive` fails even with another field still queued. |
| A moved entry could drop its staged commands before the send queue took it | Medium, fixed | A new command now combines with the staged commands in an unsent entry. |
| Queue comments omitted projection identity and staged replies | Low, fixed | The comments distinguish the wire version, staged view, and commands that survive an answer. |
| The code map said catch-up always clears the minted record | Low, fixed | The map distinguishes staging behind a sent record from storing unminted work. |
| The two-field gate does not cover refusal and GM return | Medium, deferred | The one-field gates cannot stage a second field. TASK-148 tracks those two-field checks. |
| Promotion to GM could replay a command after a lost ACK | High, deferred | Promotion already replayed drained commands before this change. TASK-147 tracks this separate path. |

The confirming review reported no findings.

## Verification

- Focused pending-edit and engine tests (2 minutes). The new regression fails before the fix and passes after it.
- `formal/edit-delivery/check.sh` and `formal/drift.sh` (3 minutes). The new gate passes and its broken control produces the lost-ACK trace.
- The full changed-path checks in `CLAUDE.md`. Allow 5 minutes for format, lint, types, Bun tests, and build, 10 minutes for Chromium, and 15 minutes for the committed mutation suite. Check the other formal areas if covered wiring changes.
