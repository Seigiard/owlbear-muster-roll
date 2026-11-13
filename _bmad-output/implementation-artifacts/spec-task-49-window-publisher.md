---
title: 'TASK-49: publish window deltas from one change signal and derive the window view once'
type: 'refactor'
created: '2026-11-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a514082e5e368ecd813b01d6bb773019ea8f236d'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-48-catch-up-state-machine.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `startReplicaEngine` (`src/replica/engine.ts`) calls `emitDelta` from 20 places. 13 pass `[]` for "something changed", and 7 pass a hint of the changed records. Each place also guards itself (`projectionSent`, a room copy signature, the shown party, `changed.length > 0`). A delta's records come from the hint for a GM, so a wrong or missing hint leaves a window stale. The engine also keeps what windows hold in six variables (`engineId`, `sequence`, `projectionSent`, `sentVisible`, `shownPending`, `shownParty`) plus `answeringNonces`. On the window side, `src/ui/main.tsx` and `src/ui/picker/link-picker.tsx` each decode the preset and call `visibleRecordMap` themselves.

**Approach:** Add `src/replica/window-publisher.ts`. It owns the stream (engine id, sequence), the projection answer, and what windows hold: visible records, the pending view, notices, sync, room copy and party. The engine signals a change with one call, `publish()`, which takes no argument. The publisher reads the current state, applies `core/visibility`, compares the result with what windows hold, and sends a delta only when something differs. Add `src/ui/window-view.ts`: one derivation of decoded preset, visible records and token links, which both windows read. What a window shows does not change.

## Boundaries & Constraints

**Always:**
- The baseline is `a514082`: `bun test` 2721 pass, 8843 assertions, 95 files; `bun run test:browser` 492 pass. Lists in `/private/tmp/claude-501/-Users-seigiard-Projects-owlbear-muster-roll-prototypes-owlbear-probe/cb274a81-7b80-4b9c-8a25-e8e948de01b1/scratchpad/t49/` (the `t49/` of Verification): `baseline-list.tsv` (file, classname, name, assertions; from `junit-list.py` beside it) and `e2e-baseline-list.tsv`.
- Phase A moves code and changes no test file. The `bun test` junit list (name and assertion count) equals the baseline, and every e2e test passes. A test that fails in phase A is a defect report. Fix the code. The only allowed exception is a test that counts raw deltas and fails because an empty delta, or a delta before the first projection, is no longer sent. Record each such test in the notes. Change it only with an oracle line in the same commit.
- Phase B adds `src/replica/window-publisher.test.ts` and `src/ui/window-view.test.ts`. Phase C retires only engine tests that a phase B test now owns, each mapped in the notes.
- The order of window messages stays: a delta that carries a command's effect goes before its `command-done` (AD-10); `open-sheet` goes after the projection it follows.
- Every record a window holds passes through `core/visibility` (CLAUDE.md rule), on both sides.
- Follow `~/.claude/shared/testing.md`, the CLAUDE.md test rules (`bun:test`, `#given` / `#when` / `#then`), oxlint and the TypeScript rules.

**Never:**
- No change to room traffic, records, storage, the room copy, the window message schemas in `src/core/ui-messages.ts`, `src/replica/catch-up.ts`, `src/replica/pending-edits.ts` or e2e tests.
- No timer, microtask or promise inside the publisher's decision of what to send. `publish()` sends synchronously, as `emitDelta` does.
- No new automatic trigger: `publish()` stays at the call sites that call `emitDelta` today (see Design Notes, rejected cuts).
- The room copy write loop is not moved; TASK-50 owns it.

## I/O & Edge-Case Matrix

Each row is a group of pair tests in `window-publisher.test.ts`: the publisher with a fake state source, and `startReplicaClient` with `createProjectionStore` as the receiver, over `createMemoryBus`. "Window equals source" means the store's `$records`, `$pending`, `$notices`, `$sync`, `$roomCopy` and `$party` equal the visible state of the source.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Before any window | `publish()` with no projection sent | nothing on the bus | N/A |
| Open | window requests | full projection of the visible state; window equals source | a repeat of a nonce still queued is answered once |
| Record change | one record changes version | one delta with that record only; window equals source | a record with the same `(k, c, a)` and `d` is not sent again |
| No change | `publish()` twice with nothing changed | no second delta | N/A |
| Header change | only notices, sync, room copy or party change | one delta with no records; window equals source | a player's party is always `[]` |
| Player visibility | template hidden, then shown; a row before its sheet | withdrawn keys, then records again; the row arrives with its sheet | a GM withdraws nothing |
| Pending view | key enters, changes, leaves the pending view | pending record; changed pending record; withdrawn and the replica record sent again | N/A |
| Large delta | records over 15000 bytes | parts in sequence, each under the limit, `withdrawn` in the first part only | a record that cannot fit one message: logged, nothing sent, what windows hold unchanged |
| Restart | `restart()` after a projection | the next `publish()` sends one record-free delta of the new engine id; the window asks again and equals source | before any projection: no delta |
| Two windows | second window opens after changes | both equal source after the next change | a change made without `publish()` reaches every window before the next projection is sent |

</frozen-after-approval>

## Code Map

Line numbers are at `a514082`.

- `src/replica/engine.ts` -- to move into the publisher: `Part`, `PendingChanges`, `DeltaContent` (215-221); variables `engineId` 259, `sequence` 318, `answeringNonces` 276, `shownPending` 372, `projectionSent` 375, `shownParty` 378, `sentVisible` 385; `sendProjection` 683 (without `deliverOpen`), `shownView` 806, `emitDelta` 816, `gmDelta` 982, `playerDelta` 999, the diff part of `pendingViewChanges` 2266, `splitParts` 3265. To delete: `roomCopySignature` and `emitRoomCopyChange` 2806-2814 (callers `publish()`), the `shownParty` compare in `followParty` 864.
- `src/replica/engine.ts` -- stays: `pendingView()` 2233 (composes the pending view; the engine passes only keys whose record differs from the replica's, as `pendingViewChanges` filters today), `currentNotices` 446, `roomCopyStatus` 2816, `windowParty` 855 (without `shownParty`), `deliverOpen`, `presetOf`, `commandDone`.
- `src/replica/engine.ts` -- stream restarts: `replaceReplica` 1594 (`engineId = newId(); sequence = 0`) and `changeRole` 2985 (same) become `publisher.restart()`. The `projection-request` branch 3182 becomes `if (publisher.project(nonce)) deliverOpen()`.
- `src/replica/engine.ts` -- the 20 `emitDelta` calls (530, 613, 634, 870, 1201, 1281, 1486, 1498, 1777, 1827, 1875, 1912, 2227, 2718, 2741, 2808, 2861, 2915, 3046, 3119) become `publish()`. Drop a guard around one only when its sole job was to avoid an empty delta or one before the first projection (`projectionSent`, `decision.fresh || changed.length > 0`, `winner !== before`, `applied.length > 0`, notices compare at 2914, `projectionSent || changed.length > 0` at 2860). Keep every other effect in those branches.
- `src/replica/catch-up.ts` -- `show.projectedOnly` stays in the decision; the engine no longer reads it, because the publisher sends nothing before the first projection.
- `src/core/visibility.ts` -- `visibleRecords`, `visibleRecordMap`; reused, not changed.
- `src/ui/replica-client.ts`, `src/ui/projection-store.ts` -- the receiver; not changed. `src/platform/mock/local-bus.ts` `createMemoryBus` -- the pair tests' bus.
- `src/ui/main.tsx` -- 180-188 (`presetDataOf`, `decodedPreset`, `visibleRecordMap`) and 240 (`liveLinks`) move to the window view; helpers 809-824 go.
- `src/ui/picker/link-picker.tsx` -- 88-94 and the helper 381-390 move to the window view; `pickerGroups(records, preset)` stays a `core` call on the view's records and preset.
- `src/replica/engine-client.test.ts` -- phase C candidates: describes `open window`, `repeated requests`, `split projection`, `sequence gap`, and `window lifecycle › re-requests a projection when a restarted engine starts sending deltas`.

## Tasks & Acceptance

**Execution:**
- [x] Baseline -- calibrate mutations M1-M8 (Verification) on the baseline engine where a twin exists, saving each failing test list.
- [x] `src/replica/window-publisher.ts` -- create the module per Design Notes from the moved code -- phase A.
- [x] `src/replica/engine.ts` -- wire the publisher, replace each `emitDelta` with `publish()`, delete the moved code and the dropped guards -- phase A.
- [x] `src/ui/window-view.ts` -- create the shared derivation; `src/ui/main.tsx` and `src/ui/picker/link-picker.tsx` read it and lose their own -- phase A. Commit phase A when the junit list equals the baseline and e2e passes.
- [x] `src/replica/window-publisher.test.ts` -- one pair test per matrix row and error case -- phase B.
- [x] `src/ui/window-view.test.ts` -- GM sees every record; a player sees only visible templates and their live links; a preset that does not decode counts as none; before the first projection the role is the initial role; an unchanged preset string keeps the same decoded preset object -- phase B.
- [x] `src/replica/engine-client.test.ts` -- retire the phase C candidates that a pair test now owns; map each in the notes -- phase C.

**Acceptance Criteria:**
- Given the branch, when `rg -n "emitDelta|sentVisible|shownPending|shownParty|projectionSent|answeringNonces|engineId|sequence" src/replica/engine.ts` runs, then nothing matches.
- Given the branch, when `rg -n "visibleRecordMap|decodePreset|liveLinks" src/ui/main.tsx src/ui/picker/link-picker.tsx` runs, then nothing matches.
- Given `window-publisher.test.ts`, when it runs, then no test starts an engine or imports `room-rig`.
- Given phase A, when `bun test` runs, then its junit list equals the baseline, apart from tests recorded under the phase A exception.

## Design Notes

**Interface** (names may change; capabilities may not be dropped):

```ts
createWindowPublisher(options: {
  send(message: EngineMessage): Promise<void>;
  newId(): string;
  presetOf(record: VersionedRecord | undefined): Preset | null;
  state(): { role; replica: ReadonlyMap; pendingView: ReadonlyMap /* keys that differ from the replica */;
             notices; sync: SyncState; roomCopy; party };
}): { publish(): void; project(nonce: string): boolean /* false: repeat or no fit */; restart(): void }
```

- Visible state: `known` = replica with the pending view over it; `preset = presetOf(known.get('preset'))`; records and pending each through `visibleRecords(role, preset, …, known)`. A GM skips building `known`.
- Diff: held `HR`/`HP`, target `R`/`P`. `withdrawn` = keys of `HP` not in `P`, plus keys of `HR` not in `R`. Records sent = those of `R` that `HR` lacks, holds at another version, or that are withdrawn. A record is the same when it is the same object, or has equal `c`, `a` and `JSON` of `d`. Pending sent = those of `P` that `HP` lacks or holds with other JSON, or that are withdrawn. The header (notices, sync, room copy, party) is compared as JSON. A delta goes out when any part differs; then held becomes the target.
- `project(nonce)`: first `publish()`, so every window on the stream agrees at each sequence, then send held as the projection at the current sequence. The first projection of a stream sets held.
- `restart()`: new engine id, sequence 0, held cleared. When an earlier stream had a projection, the next `publish()` sends one record-free delta, which makes each window ask again; later publishes send nothing until a projection.
- The window view: a pure derivation plus a `useWindowView(store, initialRole)` hook. Role is `sync.role` once loaded, else `initialRole` (the picker passes `'PLAYER'`, the store's unknown role). It returns `{ role, preset, records, links }` with `records` from `visibleRecordMap` and `links` from `liveLinks`. A preset string that does not change keeps the decoded `Preset` object, as the `useMemo` on `presetData` does today.

**Rejected cuts.**
- An automatic trigger (mark dirty in `merge`, flush in a microtask). Every engine-to-window send would then need a flush first to keep `command-done` after its delta, and delta timing and counts that tests observe would change. `publish()` is idempotent and cheap, so explicit calls at the existing sites keep the order with no new rule.
- Keep the hints and only move the code. A GM delta would still trust its hint.
- Diff by key set only, as `playerDelta` does today. A changed version would still need a hint.

**Cost.** A GM `publish()` compares every replica record with held, by identity first. Today a player already runs `visibleRecords` over the whole replica on each delta.

## Verification

**Commands:**
- `bun test --reporter=junit --reporter-outfile=<scratch>/t49/after-a.xml`, then `junit-list.py` and `diff` against `t49/baseline-list.tsv` -- phase A: no difference; after phase C: only the new tests and the mapped retirements differ.
- Mutations, one at a time, reverted. Calibrate each at the baseline in `engine.ts` where a twin exists and after phase A in the publisher; both runs fail the same tests. After phase B each fails at least one pair test. M1 drop the change signal in `raiseNewerVersion`; M2 drop the change signal after a GM command applies (`runCommand`); M3 a player delta leaves out withdrawn keys; M4 a key that leaves the pending view is withdrawn without its replica record; M5 every part carries `withdrawn`; M6 a repeated nonce is answered twice; M7 a restart keeps the engine id; M8 a record at a new version with the same key is not sent (no baseline twin). Record survivors in the notes.
- Full check: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`.

**Docs (build session, after implementation):** the architecture spine names `src/replica/window-publisher` as the owner of the projection and delta stream in AD-10, and `src/ui/window-view` in the Visibility convention. Commit it on its own.

## Implementation Notes

- Run directory: `~/.claude/artifacts/tdd-20261112-193352/task-49-window-publisher/` (`ticket.md`, `controls/`, `review-01.md` to `review-03.md`).
- Baseline at `a514082`: `bun test` 2721 pass, 8843 assertions, 95 files; `bun run test:browser` 492 pass.
- Phase A (`8e1ee0d`): the junit list of the whole `bun test` equals the baseline, and e2e passes with the same 492 names. No phase A exception was used.
- Mutations at the baseline and after phase A: M1, M3, M4, M6 fail the same tests on both sides. M5 survived on both sides. M8 has no twin. M2 (83 at the baseline, 76 after) and M7 (26 and 26, other tests) differ in a stable way. Neither difference is an order change. Under M2 the next change signal repairs the dropped one, because a delta is a diff against what windows hold; the 7 baseline-only failures are this gain. Under M7 the baseline mutant keeps sending deltas under the kept id after a restart, and the publisher mutant sends one cue and then nothing until a projection.
- Phase B: `window-publisher.test.ts` holds the matrix rows and their error cases as pair tests; `window-view.test.ts` holds the five window view cases. At the final state M1-M8 each fail at least one test (M1 and M2 an engine test, M3-M8 a pair test). M5 is now killed.
- Phase C, retired tests and their owners:
  - `engine-client › repeated requests › answers a repeat once while the first answer is still queued` -> `window publisher › answers a projection nonce once while its first projection is queued`.
  - The other phase C candidates stay, because no pair test holds their engine-level assertion. `window lifecycle › re-requests a projection when a restarted engine starts sending deltas` stays as the observer of the corrected "Before any window" row (see the Spec Change Log).
- Code review: round 1 (`mixed-terra`, 9/9 sources) found 13 minors, among them five tests that did not check what their names said, dead publisher state and stale comments. All were fixed through the tdd chain. Round 2 (`mixed-terra`, 9/9) found one major: after a delta that could not be split, the publisher kept its held state, so no later change reached the windows. The publisher now logs the failed delta, sends nothing and takes the current state as held, as `emitDelta` dropped only the failed delta. Round 2 also removed the publisher's own send queue, because the engine's `SendQueue` already keeps `delta`, projection, `open-sheet` in order, and added an engine test of that order on a restart. Round 3 (`final`, 2/2) found nothing.
- Full check at the final state: oxfmt, lint, typecheck, `bun test` (2746 pass), `bun run test:browser` (492 pass), `bun run build`.

## Spec Change Log

- Matrix row "Before any window" and the error case "before any projection: no delta" of row "Restart" (frozen) are corrected. Until the first projection of a stream, `publish()` compares the visible records and pending with the last comparison (the construction or restart snapshot first). When they differ, it sends one delta with no records, no pending and no withdrawn under the current engine id, so a window of an older stream asks again. A header-only change, or no change, sends nothing. Reason: with "nothing on the bus", a window open across a background restart keeps the old stream and never asks again, and `engine-client › window lifecycle › re-requests a projection when a restarted engine starts sending deltas` fails. The base and phase A both sent such deltas. Verdict D3 in the run directory's `ticket.md`.
- Matrix row "Large delta", error case: "what windows hold unchanged" stays true, because nothing is sent. The publisher also takes the current state as held, so later changes still go out (code review round 2).

## Review Triage Log

- Step 04 ran only the `code-review-carryover` layer, because the override turns the BMAD reviewer layers off. It returned one finding: the corrected criterion 13 (D3), filed as a deviation from the spec. It is recorded in the Spec Change Log above, and the code follows the corrected text. code-review has no open decision, no unresolved critical or major, and no deferred finding (`review-01.md` to `review-03.md`).
