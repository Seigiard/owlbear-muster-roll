---
title: 'TASK-46: give each window command one outcome: answered, refused or timed out'
type: 'refactor'
created: '2026-11-12'
status: 'done'
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
- [x] Baseline -- at `31bf252`, save the junit list of `bun test` (test name, assertion count) and the e2e pass list -- the proof compares against it.
- [x] AC3 regression test first -- a `duplicate-count` component test on the baseline interface: another client adds an empty repeat block after a duplicate of an empty source is sent; the block must stay open. Observe it red at the baseline, then port it to the new interface.
- [x] `src/core/ui-messages.ts`, `src/replica/engine.ts` -- `command-done` and the AD-10 audit -- one answer per id.
- [x] `src/core/timing.ts`, `src/ui/replica-client.ts` -- outcome API, id matching, per-kind timeouts, answer buffering until the projection.
- [x] Views and `src/preview/stub-rolling.ts` -- use outcomes; drop ids, result maps and command timers.
- [x] `src/ui/projection-store.ts` -- room state only.
- [x] Tests -- `replica-client.test.ts`: one test per client matrix row; engine tests: `command-done` for a live GM command, a queued intent at replay, a player's accepted edit, and none for an engine-made command; port harnesses without changing test names or per-test assertion counts.

**Acceptance Criteria:**
- Given the branch, when `rg -n '\$rejections|\$rollOutcomes|\$presetResults|\$snapshotResults|\$wipeResults|commandId|ACCESS_CHANGE_TIMEOUT_MS|WIPE_TIMEOUT_MS|pickTimeoutMs' src` runs, then nothing matches outside `src/ui/replica-client.ts` and its test.
- Given the junit lists, when the branch is compared with the baseline, then the only differences are new tests and retired tests, each retired one named with its owner in the notes; every ported test keeps its name and assertion count.
- Given each mutation in Verification, when applied, then at least one test fails, and the notes name it.

## Implementation Notes

### AD-10 audit

The engine paths below cover every `WindowMessage` that carries a command or request id. Each
path has one terminal answer. A duplicate delivery of an already handled id is ignored because its
original answer already settled that id.

| Window input | Accepted path | Refused path | Terminal answer |
| --- | --- | --- | --- |
| `command` while live | GM composition and apply, or accepted player edit | role, import, catch-up, or composer refusal | `command-done` after the effect delta, or `command-rejected` |
| `command` queued during catch-up | replayed GM intent or accepted queued edit | upload/import/wipe during catch-up, replay refusal, demotion, or generation replacement | `command-done` after replay, or `command-rejected` with `catching-up`, `not-allowed`, or `data-replaced` |
| `preset-upload` | all batch groups write | composition or batch write failure | `preset-uploaded` after the effect delta, or `command-rejected` |
| `preset-diff` | live GM computes the diff | player, catch-up, or diff failure | `preset-diff-result`, or `command-rejected` |
| `snapshot-check` | live GM plans the import | player, importing, catch-up, missing persistence, or invalid plan | `snapshot-check-result`, or `command-rejected` |
| `snapshot-import` | generation replacement completes | importing, missing persistence, invalid plan, changed digest, failed write, or replacement | `snapshot-imported`, or `command-rejected` |
| `wipe` | generation replacement completes | importing, missing persistence, failed write, or replacement | `wiped`, or `command-rejected` |
| `roll-request` | local or dice-extension roll completes | invalid sheet, field/formula error, role change, failed room send, or dice failure | final `roll-outcome`; `waiting-access` is progress only |

`projection-request` and `open-sheet-ack` are window protocol messages, not command outcomes.
Scene cleanup commands and token-menu commands are engine-owned ids, so they do not receive a
window `command-done`; scene refusals remain silent and menu refusals use the engine notification
path. Promoted pending edits receive new engine-owned ids. `dropPendingWork` refuses queued window
ids with `data-replaced`; an already answered player edit does not acquire a second outcome when its
later GM proposal is accepted or denied.

The implementation changes that closed the audit gaps were:

- Added `command-done` after live GM deltas and accepted player edits.
- Added replay completion ids and answered queued intents after catch-up; queued refusals and
  generation replacement use `command-rejected`.
- Kept result-bearing answers for preset, snapshot and roll paths, with `command-rejected` on every
  refusal branch.
- Moved id matching and one timeout per own request into `src/ui/replica-client.ts`; a late,
  foreign, or repeated answer cannot settle another request.

### Baseline comparison

The baseline had 2655 test cases and 8775 expect calls. The final implementation has 2681 test
cases and 8803 expect calls. All retained test names keep their assertion counts. The 36 added
cases cover client outcome matching, timeout selection, engine answers, replay, player edits,
engine-owned commands and duplicate outcomes.

Retired tests and their replacement owners:

- The six `copiesArrived` duplicate-count tests are owned by `duplicate count outcomes`: the
  unrelated empty block case, the refused case and the timed-out case now test the command outcome
  directly.
- The two `projection store` rejection-map tests are owned by `replica client command outcomes`:
  the foreign/repeated answer test and the refusal-fields test.
- `replica client wipe answers::a window takes the answer to its own wipe, and not another
  window's` is owned by the same-named test in `replica client command outcomes`.
- `sheet-create::does not show another window a rejection it did not cause` is owned by
  `replica client command outcomes::a foreign answer is dropped and a repeated answer cannot
  replace the first outcome`.

## Spec Change Log

## Review Triage Log

Step 04 ran the `code-review-carryover` layer only. Code-review round 1 (revmux `mixed-terra`,
9/9 sources) found 3 major and 14 minor findings; 14 were fixed through a second tdd batch, one was
rejected. Round 2 (`final`, 2/2 sources) found nothing. The carried items:

| Finding | Verdict | Evidence | Route |
| --- | --- | --- | --- |
| Newer window with an older background page never gets `command-done` (arch+quality-claude-3) | medium | After a deploy, a room opened before it keeps the old background page; a new window then times out commands the old engine applied. Result answers (preset, snapshot, wipe, roll) still arrive, and access, link, create and repeat-block views settle from records, so the visible harm is a false `copy.duplicateFailed` and a lost held field value after 15 s. A fix needs a protocol choice the spec does not settle. | defer |
| A late successful snapshot import no longer clears `copy.snapshotImportNoAnswer` (adversarial-claude-4) | low | The client drops every answer after the 60 s timeout (spec matrix "Timed out"), so the spec-5-3 rule that a late `snapshot-imported` clears the warning no longer holds. The warning still tells the GM to check the sheets, which stays correct. Restoring it needs a view signal for a replaced room. | defer |
| A duplicate queued during a catch-up longer than 15 s times out (adversarial-claude-1, duplicate part) | low | The spec accepts that the duplicate closes at replay; an incomplete catch-up with backoff can last up to 30 s, so the duplicate shows `copy.duplicateFailed` and a retry queues a second duplicate. | defer |

## Verification

**Commands:**
- `bun test --reporter=junit --reporter-outfile=<scratch>/after.xml` -- compare with the baseline list as above.
- `git diff 31bf252 -- tests/` -- empty; `bun run test:browser` -- every e2e test passes.
- Mutations, one at a time, reverted: M1 the client settles an answer for any id; M2 the client arms no timeout; M3 a second answer replaces the first; M4 an answer settles before the buffered projection; M5 the engine sends no `command-done` for a live GM command; M6 none at replay; M7 none for a player's accepted edit; M8 `command-done` for an engine-made command; M9 the duplicate closes on any new block with the source's values; M10 `acl-set` uses the default timeout.
- Full check from CLAUDE.md: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`.

**Docs (build session, after implementation):** AD-10 in the architecture spine gains the one-answer rule and the client's ownership of ids and timeouts; committed on its own.
