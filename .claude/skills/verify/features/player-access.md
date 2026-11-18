# Player access and visibility

A GM grants write access to a sheet, marks its owner and controls what players
see. Hidden data remains in replicas; visibility is not a security boundary.

## Sub-features

- `access-grant`: grant and revoke one player's write access.
- `access-owner`: mark an owner and check that player's sheet ordering.
- `access-visibility`: hide GM-only templates and tabs from player views.
- `access-pending`: show a pending edit until an online GM accepts it.

## How to get to it (user POV)

The GM opens a sheet of a visible sheet set and chooses `Доступ` in its header.
The player opens the same sheet in their own extension window. Ownership
controls are in the same GM panel. Hidden sheets and tabs have no player
navigation entry.

## Driving it with Playwright

Run `bun run verify players` for access, owner, visibility and pending-edit
scenarios. A passing single-GM quick route does not establish these results.

Reuse `tests/access.e2e.ts`'s multi-client setup and
`tests/support/room.ts`'s `openClientWindow`, `openClientBackground` and
`addPartyMember`. Put both participants in one context, but use distinct
`client`, `player` and `device` values. Both pages of the player carry
`?mock-client=p&mock-role=PLAYER&mock-player=lisa&mock-name=Лиза&mock-device=p`.
The GM needs an existing visible sheet and the mock party needs `Лиза`.
Wait for the player header's `Только чтение` before changing rights.

Click the GM button `Доступ`. In the region `Доступ`, scope to the group `Лиза`
and check the exact checkbox `Лиза: может править`. The player header must
change to `Можно править`. Edit a visible field as that player and observe the
same value on the GM. Uncheck it and confirm `Только чтение` returns and the
player can no longer edit. Capture both windows and the trace.

For ownership and visibility drive the existing controls in `tests/owner.e2e.ts`
and `tests/hidden-tabs.e2e.ts`; assert the player's sidebar and visible tabs,
not a storage flag. For pending edits use `tests/pending.e2e.ts` and
`tests/no-gm.e2e.ts` to establish the no-answer condition, then observe the
pending status and its resolution on reconnection. Preserve the exact setup
and participant traces with the proof.

## Gotchas

- A blank mock room has no party member. An empty access panel is a failed
  precondition for grant/revoke, not a passing rights check.
- A player-only empty room cannot establish the GM's initial data. Start the
  GM and load the preset before testing catch-up.
- Distinct browser contexts do not share this mock room's BroadcastChannels.
- Player-editable single sheets have no per-player `Доступ` panel.
- A screenshot of a checked GM box does not prove a player's edit was accepted.
