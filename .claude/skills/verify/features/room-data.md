# Room data and recovery

A GM imports and changes presets, retains room data, restores from the room
copy and wipes a disposable room after confirmation.

## Sub-features

- `preset-change`: keep compatible values and confirm destructive changes.
- `room-copy`: save readable room data or report insufficient capacity.
- `room-recovery`: catch up after joining and read with no GM online.
- `room-wipe`: cancel or confirm removal of the disposable room's data.
- `room-sync`: existing cross-client synchronization scenarios.

## How to get to it (user POV)

Use `Настройки` for preset upload, room-copy status and `Очистить всё`.
Reopen the extension to observe persistence and recovery.
Players open their room window to read the latest available visible sheets.

## Driving it with Playwright

Run `bun run verify data`. The profile includes preset changes, snapshots,
room-copy, wipe, catch-up, replica and existing synchronization tests.
Use `tests/preset-change.e2e.ts` for actual upload and confirmation controls.
Also run `bun run verify sheets` when a preset changes tab layout.
The new quick section-move journey uploads a different layout while keeping
field and repeat-scope ids stable, then checks the original block values.

Use `tests/room-copy.e2e.ts`, `tests/catch-up.e2e.ts` and `tests/no-gm.e2e.ts`
for their explicit participant and room-metadata preconditions.
For wiping, use only the room created by that test. Cancel first and inspect
the existing sheet. Confirm a second attempt and inspect the empty window.
Keep the trace and visible recovery result with the evidence.

## Gotchas

- Timer completion alone is not proof that a client responded.
- A mock fault demonstrates app handling of that fault, not an Owlbear defect.
- Wiping a shared or live room is outside this skill's safe local workflow.
- Recovery from a room copy differs from reusing a still-running background.
