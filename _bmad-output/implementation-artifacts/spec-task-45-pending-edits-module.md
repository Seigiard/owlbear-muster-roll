---
title: 'TASK-45: move the pending edit policy out of the replica engine'
type: 'refactor'
created: '2026-11-12'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'caf947b4c4d43b616efbaad154e8ee2128f63719'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-task-47-shared-engine-test-rig.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The player side of AD-4 is split across a seam that does not hold. `src/replica/proposal-queue.ts` holds and sends entries, but every decision about a pending edit lives inside `startReplicaEngine` in `src/replica/engine.ts` (about 13 functions, from `handlePlayerCommand` to `recheckProposal`). The only tests of that policy are in `engine-propose.test.ts`, through full engines and real-time pauses.

**Approach:** Add one deep module, `src/replica/pending-edits.ts`, that owns every pending edit decision behind a small interface. The engine passes it events and executes what it returns. Test the policy through that interface with a fake minter, clock and scheduler. Keep in `engine-propose.test.ts` only the tests that prove the engine wiring or need two engines. Behaviour does not change.

## Boundaries & Constraints

**Always:**
- Behaviour does not change. Work in two phases. Phase A moves the code and leaves every test file untouched; every replica test passes with the same names and per-test assertion counts as at `baseline_commit`. Phase B moves tests.
- `core/access` stays the only judge of write access: the module calls `proposalAllowed`, `canEdit` and `resolveSheet`, and judges nothing itself.
- `engine.ts` imports nothing from `proposal-queue.ts`. Only `pending-edits.ts` uses the proposal queue and its patch helpers.
- A test that leaves `engine-propose.test.ts` is retired by name: the implementation notes map each removed test to the test that now owns its behaviour.
- A red test is a defect report (`~/.claude/shared/testing.md`). Never delete, skip or loosen a test to reach green in phase A.
- Follow CLAUDE.md test rules (`bun:test`, `#given` / `#when` / `#then`), the oxlint rules and the TypeScript rules. Use the glossary term "pending edit".

**Never:**
- No change to the GM side of AD-4 (`receiveProposal`, `checkProposal`, `unlinkRemovedBlock`), to `src/core/`, `src/ui/`, `src/platform/`, `docs/` or e2e tests.
- No change to the behaviour of `proposal-queue.ts`. Its tests stay as they are.
- No change to `engine-preset.test.ts` or other engine test files: their pending edit tests stay as extra evidence.
- No real-time waits and no full engine in `pending-edits.test.ts`.

## I/O & Edge-Case Matrix

Each row is a decision `pending-edits.test.ts` covers through the interface. "Sent" means the fake `enqueue` composed a record.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Edit with access | live, own `acl:` | sent once with `c` = highest known `c` of the key + 1, stripped to the template; `notify` false | N/A |
| Edit refused | other command kind; set sheet with no `acl:`; single sheet hidden or not player-editable | `not-allowed`, nothing sent | composer error comes back as its reason |
| Single sheet players edit | no `acl:` | sent | N/A |
| Second edit of one key | entry exists | one entry, patches combined, `c` raised, only the newest sent | N/A |
| Edit in catch-up | `catchingUp` true | nothing sent, overlay shows it; `caughtUp` mints over the records then and sends | `caughtUp` drops an entry no longer allowed, one `notify` |
| Edit that cannot go | removed block (`gone`), too large | dropped, `notify` true | N/A |
| Overlay | newer base record with other fields | patch over the base; a sent version keeps its `(c, a)`; a waiting one shows base `c` + 1 | an entry that makes nothing is not shown |
| Answer | ack or record with the entry's `(k, c, a)`; older `c` | clears and returns true; older `c` leaves it | N/A |
| Reject, no match | other `c` or `a` | `null`, nothing changes | N/A |
| Reject denied | reason `denied` or no `current` | dropped, `notify`, `merge` null | N/A |
| Reject stale above | `current.c` ≥ entry `c` | rebased on known merged with `current`, new `c`, sent at once; `merge` = `current` | holds the patch already: cleared, no `notify`; removed block or too large: dropped, `notify` |
| Reject stale below | `current.c` < entry `c` | rebuilt, sent only on the running backoff | N/A |
| Reject stale in catch-up | `catchingUp` true | waits for `c`; `caughtUp` mints above `current` | N/A |
| Repeat block patches | add, remove on stale | add keeps order and cells; remove stays a removal | N/A |
| Records change | own access revoked; sheet deleted; block removed | entries of that sheet drop, waiting ones too, one `notify` | removal of a removed block drops with no `notify`; another player's revoke or another sheet keeps entries |
| Preset change | field removed; removed + kept; row renamed; block section renamed | drop silent; strip and send again; move to the new key and send again; removal follows the section | N/A |
| Quiet window | denials at fake times | `notify` only when `editDeniedQuietMs` passed since the last shown one | N/A |
| GM back | minted and waiting entries | minted ones sent now, backoff starts again; waiting ones not | N/A |
| No answer | fake schedule | same `(k, c, a)` resent at start, doubling to max | N/A |
| Drain, clear | entries of each kind | drain returns removal / add then cells / fields commands and empties; clear empties and stops resends | N/A |

</frozen-after-approval>

## Code Map

- `src/replica/engine.ts` -- the code to move: `handlePlayerCommand` (1648), `proposeEntry`, `rebuiltRecord`, `playerMayEdit`, `strippedProposal`, `proposeWaiting` (1776), `proposalContext` (player uses only), `clearAnswered` (1914), `receiveReject` (1940), `notifyDenied` + `lastDeniedAt` (1986, 360), `waitingRecord` and the proposal loop of `pendingView` (2307-2346), `dropDisallowed` (3224), `recheckProposal` (3279); module scope `PlayerEditCommand` (283), `templateMoves`, `templateOfKey`, `isPlayerEdit`, `patchOf`, `commandsOf`, `unknownPatch`, `deniesEdit` (4001-4108). The proposal queue is built at 343.
- Engine call sites that stay and call the module: `runCommand` (1041), `pendingView`, `pendingViewChanges` (2367), the catch-up exit (3152), `receiveRecords` (3201, role guard stays in the engine), `dispatchRoomMessage` commit and reject (3796, 3813), `setGmLink` (3640), `changeRole` (3536), `seeGeneration` (2808), `dropPendingWork` (2847), the import path (1383), `stop` (3909).
- `src/replica/proposal-queue.ts` -- the container (`createProposalQueue`: send newest version, backoff, `hold`) and the pure helpers `combinePatches`, `proposedRecord`, `strippedPatch`, `movedPatches`. Reuse as is.
- `src/core/access.ts` -- `proposalAllowed`, `canEdit`, `ProposalContext`. `src/core/sheets.ts` -- `resolveSheet`, `dependentSheetId`. `src/core/preset-migrate.ts` -- `presetMoves`, `stripToTemplate`. `src/core/message-size.ts` -- `recordFitsOneMessage`. `src/core/merge.ts` -- `counterAbove`, `mergeRecords`.
- `src/replica/composers.ts` -- `createComposers(connectionId).compose(context, command)`; the unit tests use it over a dry context, so the pre-check runs on what the engine composes.
- `src/replica/engine-propose.test.ts` -- 71 tests: 14 GM-side tests in `a GM client answers a proposal`, the rest player-side. `src/replica/engine-preset.test.ts` 649-794 -- pending edits across a preset change (stays).
- `src/replica/room-rig.ts` -- the engine test rig (TASK-47).

## Design Notes

Interface (names may be refined, capabilities may not be dropped):

```ts
export type PlayerEditCommand = Extract<Command, { type: 'field-patch' | 'repeat-block-add' | 'repeat-block-delete' }>;
type Denial = { notify: boolean }; // true: show "Нет прав на правку" now; the quiet window is applied
export function createPendingEdits(options: {
  timing: Pick<Timing, 'proposeResendStartMs' | 'proposeResendMaxMs' | 'editDeniedQuietMs'>;
  playerId: string; connectionId: string;
  records: () => ReadonlyMap<string, VersionedRecord>; // the replica
  catchingUp: () => boolean;
  presetOf: (record: VersionedRecord | undefined) => Preset | null; // the engine's cached decoder
  compose: (view: ReadonlyMap<string, VersionedRecord>, command: Command) => Result<VersionedRecord[], RejectionReason>;
  mint: (key: string, highestKnownCounter: number) => Version;
  now: () => number; // monotonic clock of the quiet window
  enqueue: ProposalQueueOptions['enqueue']; schedule?: ProposalQueueOptions['schedule'];
}): {
  edit: (command: Command, view: ReadonlyMap<string, VersionedRecord>) => Result<Denial, RejectionReason>;
  overlay: (view: Map<string, VersionedRecord>) => void; // puts each entry's shown record over the view
  answered: (edits: readonly EditId[]) => boolean;       // true when an entry cleared
  rejected: (message: RejectMessage) => (Denial & { merge: VersionedRecord | null }) | null; // null: no entry matches
  caughtUp: () => Denial;
  recordsChanged: (presetBefore: VersionedRecord | undefined) => Denial;
  gmBack: () => void;
  size: () => number;
  drain: () => PlayerEditCommand[]; // the commands of every entry, in entry order; empties the module
  clear: () => void;
};
```

- The engine shows the notification when `notify` is true and `options.editDenied` is set, and keeps its own `emitDelta`, `reject(id, …)` and room merge. For `rejected`, it shows the notice first, then merges `merge` through `receiveRecords` (emitting an empty delta when nothing changed), or emits an empty delta when `merge` is null. `changeRole` drains always and adds the commands to the GM pending queue only when promoted to GM, after `engineId = newId()`, as today.
- The engine computes `pendingView()` before it calls `edit`; the view is pure, so the order change is not observable.
- `dropDisallowed` merges a moved part into an existing entry inline. The module uses `combinePatches(part.patch, existing.patch)` instead. The two differ only for an `add` moved onto a `fields` entry of the same repeat block key, which instance ids unique per sheet make unreachable. Record this in the implementation notes.

## Tasks & Acceptance

**Execution:**
- [ ] Baseline -- at `baseline_commit`, save the junit list of `src/replica/` (test name and assertion count) and the wall time of `engine-propose.test.ts` and of `bun test` -- the proof compares against it.
- [ ] `src/replica/pending-edits.ts` -- create the module per Design Notes from the moved engine code -- phase A.
- [ ] `src/replica/engine.ts` -- call the module at each call site; delete the moved functions -- phase A; commit when the junit list equals the baseline.
- [ ] `src/replica/pending-edits.test.ts` -- one test per matrix row and error case, with a fake `mint`, `now`, `schedule` and `enqueue`, and real composers -- phase B.
- [ ] `src/replica/engine-propose.test.ts` -- keep the 14 GM-side tests, the two-engine test, and these wiring tests: `with access: proposed…`, `of a sheet of a sheet set with no access…`, `clears on a commit that echoes…`, `denied: dropped, the value returns…`, `stale: applies its patch…`, `during catch-up: shown at once…`, `of a sheet whose access is revoked while live…`, `stays when a revoke and a re-grant…`, `is cleared, with its pending view…`, `of a player made GM…`, `is resent as soon as the GM link comes back…`. Remove the rest -- phase B; commit.

**Acceptance Criteria:**
- Given phase A, when `bun test src/replica/` runs, then its junit list equals the baseline.
- Given each mutation in Verification, when applied at the baseline (in `engine.ts`) and after phase A (in `pending-edits.ts`), then the same tests fail; after phase B at least one test fails, and the notes name it.
- Given the branch, when `rg -n "proposal-queue" src/replica/engine.ts` runs, then nothing matches.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun test --reporter=junit --reporter-outfile=<scratch>/after.xml src/replica/` and diff against the baseline list -- phase A: no diff; phase B: only the removed engine-propose tests and the new pending-edits tests differ.
- Mutations, one at a time, each reverted: M1 a second edit replaces the patch (no combine); M2 an edit in catch-up is sent at once; M3 no strip to the template; M4 the quiet window never suppresses; M5 stale below `c` sends at once; M6 no `proposalAllowed` pre-check on edit; M7 records change drops nothing; M8 no move after a preset change; M9 stale rebases on `current` alone, not merged with the known record.
- Wall time of `engine-propose.test.ts` (4.9 s at the baseline) and of `bun test`, before and after.
- Full check from CLAUDE.md: `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test` -- all pass. (The parent runs `test:browser` and `build`.)
