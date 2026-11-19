---
title: 'TASK-119: Keep a committed player edit from coming back over a later GM edit'
type: 'bugfix'
created: '2026-11-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The GM commits a player's `(k, 3, P)`, and the commit never reaches the player. The GM then edits the same field at `c=4`. The player resends `(k, 3, P)`, `checkProposal` calls it stale, and the player rebuilds it at `c=5`. The GM commits that over its own edit (formal finding F1, `DoubleApply.cfg`, TASK-119).

**Approach:** The GM client remembers the proposals it committed. A resend of one of them gets the ACK again with the held record, not `stale`. A proposal that really lost a race was never committed, so it still reads as `stale`. Pin it with an engine test, and move `NoDoubleApply` into the edit-delivery gates.

</frozen-after-approval>

## Implementation Notes

- `room-protocol.ts`:
  - `committedEdits` holds `JSON.stringify([generation, k, c, a])` for each proposal whose verdict was `commit` or `commit-existing`. It keeps the newest 1000, oldest first; `rememberCommitted` moves a repeat to the end.
  - Before `checkProposal`, a proposal whose key is in the set, whose `a` is its sender, and whose key has a held record is answered with `sendCommits([held], [edit])`.
  - The player's `answered` clears the entry on the echo and merges the GM's record, as it already does for a commit whose record a newer GM edit replaced.
- Why GM memory: `stale` compares counters, and a GM edit leaves no trace of the player cell it replaced. Neither side can tell the two cases from the records alone.
- Accepted:
  - The memory is in RAM. A lost commit, then a GM reload before the player's resend, then a GM edit of the field still applies the player's edit twice. The model leaves `stop` and reloads out.
  - Two GM pages do not share the memory. The room has one GM, and the model does not cover two GM clients.
  - A later player edit of another field of the same key, made before the resend, combines with the unacknowledged patch into a new `(k, c, a)`. The GM never committed that version, so the old cell can still come back. A fix belongs to the player's queue (AD-4's one entry per key); TASK-132 tracks it.
- Model (`formal/edit-delivery/EditDelivery.tla`):
  - New GM variable `committed`. `GmReceives` answers a counter in it with the held cell and the echo, before the access check, as the code does. `commit` and `commit-existing` add the counter.
  - `GmFlips` keeps the memory, as a live-gate flip does in the code. Its comment no longer says "closed tab".
  - `NoDoubleApply` is in `EditDelivery.cfg` and `Refusals.cfg`. `DoubleApply.cfg` is gone. `broken/ForgetsCommitted.cfg` removes the rule and fails `NoDoubleApply`.
- Edit-delivery skill: F1 becomes a "Fixed" paragraph; the config table, the property status, the `GmReceives` code map row (gate now at line 285), the bounds and the coverage record are updated.
- AD-4 in `ARCHITECTURE-SPINE.md` states the rule.
- Review: Blind Hunter, 6 findings.
  - Patched:
    - the key is remembered after `sendCommits`, and a hit moves it to the end;
    - a test of the `commit-existing` branch;
    - the limit comment (30-second backoff cap) and the `receiveProposal` comment.
  - Recorded as residuals: the combined-patch path (TASK-132) and a second GM page.
  - Rejected: listening to other GMs' commit acks. It needs a two-GM test the rig cannot set up simply, and the owner's verdict accepts two GM pages.
- Checks: `oxfmt`, lint, typecheck, `bun test` (3620 pass), `test:browser` (587 pass), `mutants` (53 of 53 killed), build, `formal/edit-delivery/check.sh` (every config as expected), `formal/drift.sh`. Both new engine tests fail without the fix: the first without the shortcut, the second without the `commit-existing` memory.
