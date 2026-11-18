---
title: 'TASK-91: keep repeat-tab navigation and drafts bound to identity'
type: 'bug'
status: 'approved-split'
parent_spec: '_bmad-output/implementation-artifacts/spec-task-77-98-completion.md'
---

# TASK-91: repeat-tab identity

## Scope

A window must remember the identity of its selected rendered tab, not its transient position in a filtered list. A repeat-tab identity includes its source tab and repeat scope/block instance. A non-repeat tab identity includes its source tab. If the target still exists after a remote lifecycle update, the same target remains selected. If the target is removed, its panel must unmount so no delayed field save can write the draft to a successor block.

The existing pure navigation reducer remains the owner of navigation state; React derives rendered identities, dispatches transitions, and uses identity-based keys at the UI boundary.

## Acceptance mapping

1. Remote additions or deletions before a selected target retain that source tab or repeat block while it exists.
2. A delayed save started in block B cannot reach block C after removal of B; a vanished target does not redirect its draft.
3. A selected non-repeat Notes tab remains selected when another GM adds or removes a preceding repeat-tab block.
4. Deleting a non-final repeat block remounts the next block's delete controls in their idle state, so cancellation remains usable.
5. Browser regressions cover remote lifecycle changes during a delayed save and consecutive local delete/cancel flows.

## Non-goals

- TASK-95 role-filtered token-link opening.
- TASK-96 DOM/preview repeat-block context and reveal behavior.
- TASK-97 shared copy and accessible-name work.
- Changes to repeat-block storage, permissions, Builder lifecycle, or source-tab visibility policy.

## Verification

- Lock browser regressions in `tests/repeat-tabs.e2e.ts`; extend `src/ui/navigation.test.ts` only where a reducer transition has an independent pure-state oracle.
- Run the focused browser owner with one worker before global browser-slot use.
- On stable production state, run the repository full checks: formatter, lint, typecheck, unit tests, browser tests with `--workers=2` only after the parent grants the shared slot, and build.
