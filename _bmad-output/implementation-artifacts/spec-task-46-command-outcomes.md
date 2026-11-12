---
title: 'TASK-46: give each window command one outcome: answered, refused or timed out'
type: 'refactor'
created: '2026-11-12'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '31bf2526fb88eac670fde1c59c53c4842a602a66'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-45-pending-edits-module.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every window action that sends a command re-implements one loop: it keeps the command id in component state, looks it up during render in `$rejections` and one of four result maps of `src/ui/projection-store.ts`, arms its own `setTimeout` with its own constant, and guesses success from records. The engine sends no answer for most commands that succeed, so `duplicate-count.tsx` guesses from arriving repeat blocks and closes on an unrelated new block with the same values (`deferred-work.md:89`; still open for a source block with no name, such as an empty one). `src/ui/replica-client.ts` has four near-copies of send.

**Approach:** The engine answers every window command and request exactly once, by its id. The window client alone matches answers to its own ids, owns one timeout per command kind, and gives the caller one outcome: answered with a result, refused with a reason, or timed out. Views react to that outcome; `projection-store` keeps room state only. Visible behaviour stays the same, except the duplicate fix and the fault-only timeouts named below.

## Boundaries & Constraints

**Always:**
- The engine sends exactly one answer per window command or request id. Success: the existing answer (`preset-diff-result`, `preset-uploaded`, `snapshot-check-result`, `snapshot-imported`, `wiped`, the final `roll-outcome`) or a new engine message `{ t: 'command-done', id }` for every other command, sent after the delta that carries its effect. Refusal: `command-rejected`, as today. Engine-made commands (`sceneCommandIds`, `menuCommandIds`) get no `command-done`, as they get no window rejection today.
- AD-10 check, recorded in the Implementation Notes: walk every engine path a window command or request takes and name its single answer. Each path that ends with no answer gets one, and the notes list what changed.
- A GM command queued during catch-up is answered when replay applies it (`command-done`) or refuses it (`command-rejected`), or when `dropPendingWork` refuses it (`data-replaced`). A player's field or repeat block edit is answered `command-done` once `pending-edits` accepts it; the GM's later check is not this command's outcome (AD-4 pending marks and the denied notice stay as they are).
- The client settles each own id once: the first answer or the timeout wins, and anything later for that id is dropped. An answer for an id it did not send is dropped. While the window waits for or assembles a projection, answers wait with the deltas and settle in arrival order once the projection is in the store, so an answered outcome always finds every record the engine sent before it.
- A command too large for one message is refused with reason `too-large` without being sent, as one outcome, with no timer.
- Timeouts live in `Timing` (`src/core/timing.ts`) and only the client reads them: preset diff and upload, snapshot check `presetRequestTimeoutMs` (15 s); snapshot import `snapshotImportTimeoutMs` (60 s); wipe (60 s, was `WIPE_TIMEOUT_MS`); `acl-set` and `owner-set` (5 s, was `ACCESS_CHANGE_TIMEOUT_MS`); `link-set` (5 s, was `LINK_PICKER_TIMING.pickTimeoutMs`); a roll, a new wait longer than the dice extension's longest one (90 s); every other command a new default of 15 s. The old constants and `pickTimeoutMs` are removed.
- Each view keeps its visible behaviour: same text, focus, closing and waiting state. A view that today never timed out treats timed out as it treats a refusal (the field drops its held value, a deletion returns focus to "⋯", a create stops waiting, a roll shows `copy.rollFailed`, a duplicate shows `copy.duplicateFailed`). This is a fault-only change: no answer in 15 s or more.
- The duplicate block closes only on its own command's answered outcome. During catch-up it now closes when replay answers, not when the pending view shows the copies.
- A roll's `waiting-access` is progress, not an outcome: the client passes it to the caller, and the button shows `copy.rollWaitingForGm` as today.
- Follow `~/.claude/shared/testing.md`, CLAUDE.md test rules (`bun:test`, `#given` / `#when` / `#then`), the oxlint and TypeScript rules. Interface text stays in `src/ui/copy.ts`; no copy change is expected.

**Never:**
- No change to e2e tests: `git diff 31bf252 -- tests/` stays empty, and every e2e test passes.
- No change to room traffic (`app.muster-roll/sync`), records, storage or snapshots. `command-done` is a `LOCAL` message on `app.muster-roll/ui` only.
- No change to `$openRequest` or the open-sheet flow, to `pending-marks`, or to `pending-edits.ts` decisions.
- No component keeps a command id, reads a result map, or arms a command timeout. No new constant for a view's own command wait.
- Never weaken, skip or delete a test to reach green. A retired test is named with the test that now owns its contract.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Answered | live GM command applies | engine sends the delta, then `command-done`; the outcome is answered and the store already holds the records | N/A |
| Answered with a result | preset diff, snapshot check, preset upload, snapshot import, wipe, roll | answered with the answer's fields (count, sheets, digest; the roll code) | N/A |
| Refused | `command-rejected` for an own id | refused with the reason; `count-changed` keeps count, sheets, digest | N/A |
| Timed out | no answer within the kind's timeout | timed out; a later answer for that id is dropped | N/A |
| Too large | command over one message | refused `too-large`, nothing sent, no timer | N/A |
| Foreign or repeated answer | answer for another window's id; a second answer for an own id | dropped; the first outcome stands | N/A |
| Answer before the projection | answer arrives while requesting or assembling | settles after the projection and earlier deltas are in the store | N/A |
| GM in catch-up | command queued | answered at replay when applied; refused at replay, on `data-replaced`, or `not-allowed` after a demotion | exactly one answer per id |
| Player edit | field patch, repeat block add or delete | answered once `pending-edits` accepts it; refused when its pre-check refuses | the GM's later reject is no second outcome |
| Roll waiting for the GM | `roll-outcome` `waiting-access` | progress callback, no outcome; the final code settles it | N/A |
| Duplicate, unrelated block | another client adds a repeat block with the source's values (empty source) before the answer | the block stays open; it closes on its own answered outcome | refused or timed out: `copy.duplicateFailed` |
| Each other view | create, delete, field, repeat block add/delete, access, link picker, preset, snapshot, wipe, dice | same behaviour as at `31bf252` on answered and refused; timed out as listed above | N/A |

</frozen-after-approval>

## Code Map

- `src/core/ui-messages.ts` -- add `command-done` to `engineMessageSchema`; reuse `CommandRejectedMessage`, `PresetResultMessage`, `SnapshotResultMessage`, `RollOutcome`.
- `src/replica/engine.ts` -- answers: `reject` (515, skips `sceneCommandIds`, notifies for `menuCommandIds`), `runCommand` (1006), `handlePlayerCommand` (1614), `queueIntent` (2058), `replayPending` (2152), `dropPendingWork` (2590), `changeRole` (3187, promoted edits get new ids no window owns), `uploadPreset` (~1105), `importFromSnapshot` / `wipeRoom` / `replaceGeneration` (~1240-1370), `replyRoll` (2022). `emitDelta` (673) enqueues synchronously on the same queue as answers.
- `src/ui/replica-client.ts` -- the four sends and `handleMessage` id matching; phases `requesting` / `assembling` / `live` and the `buffered` deltas.
- `src/ui/projection-store.ts` -- remove `$rejections`, `$rollOutcomes`, `$presetResults`, `$snapshotResults`, `$wipeResults`, their setters, and `withRecent` if unused.
- `src/core/timing.ts` -- `Timing`, `TIMING`, `ACCESS_CHANGE_TIMEOUT_MS`, `WIPE_TIMEOUT_MS`, `LinkPickerTiming.pickTimeoutMs`. Every `Timing` literal in tests gets the new fields.
- Views: `src/ui/main.tsx` (create 357, delete 422, 487-509, `editing` / `rolling` / `blockTools` / `presetClient` memos 268-297), `src/ui/sheet/use-field-edit.ts` (`Held`, `useShownValue` 443), `use-repeat-blocks.ts`, `dice-button.tsx`, `duplicate-count.tsx` (`copiesArrived`, `expectedCopies` become unused), `access-panel.tsx` (reducer keyed by command id, own timers 120-136), `preset-section.tsx`, `sheet-header.tsx`, `src/ui/picker/link-picker.tsx` (and `picker/main.tsx`), `src/ui/preset-actions.tsx`, `src/ui/settings/snapshot-actions.tsx`, `wipe-actions.tsx`, `settings-view.tsx`, `src/preview/stub-rolling.ts`.
- Tests that read result maps or use `sendCommand` ids: `src/replica/room-rig.ts` (`send`, `rejection`), `engine-*.test.ts` (catch-up, client, dice-extension, import, no-gm, preset, roll, sync, wipe), `src/ui/replica-client.test.ts`, `projection-store.test.ts` (two rejection-map tests), `preset-errors.test.ts`, `picker/link-picker.test.tsx`, `sheet/duplicate-count.test.ts`.

## Design Notes

Interface (names may be refined; capabilities may not be dropped):

```ts
export type CommandOutcome<Answer> =
  | { kind: 'answered'; answer: Answer }
  | { kind: 'refused'; rejection: CommandRejectedMessage }
  | { kind: 'timed-out' };
export type ReplicaClient = {
  // Never rejects; settles once. `urgent` keeps today's closing-window path.
  sendCommand: <C extends Command>(command: C, options?: { urgent?: boolean }) => Promise<CommandOutcome<AnswerOf<C>>>;
  requestPresetDiff: (data: string) => Promise<CommandOutcome<ErasedCounts>>;  // count, sheets, digest
  requestSnapshotCheck: (data: string) => Promise<CommandOutcome<ErasedCounts>>;
  requestRoll: (request: RollRequest, onWaitingAccess?: () => void) => Promise<CommandOutcome<FinalRollOutcome>>;
  acknowledgeOpen; flushNow; stop; // stop settles every waiting outcome as timed out
};
```

A view that can send again before an older outcome lands (a field save, an access change) ignores a stale outcome by its own token or reference, never by a command id. Field saves keep "only the last save counts".

## Tasks & Acceptance

**Execution:**
- [ ] Baseline -- at `31bf252`, save the junit list of `bun test` (test name, assertion count) and the e2e pass list -- the proof compares against it.
- [ ] AC3 regression test first -- a `duplicate-count` component test on the baseline interface: another client adds an empty repeat block after a duplicate of an empty source is sent; the block must stay open. Observe it red at the baseline, then port it to the new interface.
- [ ] `src/core/ui-messages.ts`, `src/replica/engine.ts` -- `command-done` and the AD-10 audit -- one answer per id.
- [ ] `src/core/timing.ts`, `src/ui/replica-client.ts` -- outcome API, id matching, per-kind timeouts, answer buffering until the projection.
- [ ] Views and `src/preview/stub-rolling.ts` -- use outcomes; drop ids, result maps and command timers.
- [ ] `src/ui/projection-store.ts` -- room state only.
- [ ] Tests -- `replica-client.test.ts`: one test per client matrix row; engine tests: `command-done` for a live GM command, a queued intent at replay, a player's accepted edit, and none for an engine-made command; port harnesses without changing test names or per-test assertion counts.

**Acceptance Criteria:**
- Given the branch, when `rg -n '\$rejections|\$rollOutcomes|\$presetResults|\$snapshotResults|\$wipeResults|commandId|ACCESS_CHANGE_TIMEOUT_MS|WIPE_TIMEOUT_MS|pickTimeoutMs' src` runs, then nothing matches outside `src/ui/replica-client.ts` and its test.
- Given the junit lists, when the branch is compared with the baseline, then the only differences are new tests and retired tests, each retired one named with its owner in the notes; every ported test keeps its name and assertion count.
- Given each mutation in Verification, when applied, then at least one test fails, and the notes name it.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun test --reporter=junit --reporter-outfile=<scratch>/after.xml` -- compare with the baseline list as above.
- `git diff 31bf252 -- tests/` -- empty; `bun run test:browser` -- every e2e test passes.
- Mutations, one at a time, reverted: M1 the client settles an answer for any id; M2 the client arms no timeout; M3 a second answer replaces the first; M4 an answer settles before the buffered projection; M5 the engine sends no `command-done` for a live GM command; M6 none at replay; M7 none for a player's accepted edit; M8 `command-done` for an engine-made command; M9 the duplicate closes on any new block with the source's values; M10 `acl-set` uses the default timeout.
- Full check from CLAUDE.md: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`.

**Docs (build session, after implementation):** AD-10 in the architecture spine gains the one-answer rule and the client's ownership of ids and timeouts; committed on its own.
