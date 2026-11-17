# TASK-90: Receiving-GM repeat-tab proposal admission

## Scope

A player with field edit access can forge a raw proposal that creates or deletes a repeat-tab block. The receiving GM must refuse this lifecycle change. The receiving GM must still admit permitted field edits to an existing visible repeat-tab block. GM lifecycle actions stay permitted.

## Evidence

The review finding `bugs+impl-codex-1` identifies the missing check in `src/core/access.ts` on the receiving-GM path: `room-protocol.ts` → `receiveProposal` → `checkProposal` → `proposalJudgement`.

## Plan

1. Add room-rig regression tests that inject raw player creation and deletion proposals into a real receiving GM, then observe rejection, no commit or ACK, no persisted creation, and unchanged values and token links.
2. Add or retain public-path coverage for a permitted player field edit to an existing visible repeat-tab block and a GM lifecycle action.
3. Restrict proposal admission in `src/core/access.ts` so a player may alter fields in an existing repeat-tab block but may not create or delete that block.
4. Run the focused regression, calibrate its protected assertions, then run format, lint, typecheck, Bun, browser, and build checks. Browser runs require the parent-owned slot.

## Boundaries

- TASK-92 owns other repeat-scope admission work.
- The mock room rig proves application behavior, not live Owlbear host behavior.
