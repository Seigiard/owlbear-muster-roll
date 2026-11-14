# State invariants and preservation cases

The state shapes below are design candidates. The invariants are the contract. Choose final field names during each task's research, and retain the existing public interface.

## CAP-1: projection delivery

Owner: `src/ui/replica-client.ts`, `startReplicaClient`.

Current state combines `phase`, `nonce`, `assembly`, `buffered`, `liveEngine`, `lastSeq` and request timers. Candidate phases are `requesting`, `assembling` and `live`.

| Phase | Owned data and invariant |
| --- | --- |
| requesting | Current acquisition nonce; no active assembly or live stream identity |
| assembling | Current nonce and a complete assembly descriptor with received parts |
| live | Current engine and sequence; no active assembly |

Queued-send identity and pending command outcomes have lifetimes beyond one phase. Keep them explicit rather than forcing them into an incompatible union branch.

Preserve:

- Publish only after all parts of one compatible assembly arrive. Ignore obsolete request nonces.
- Stop repeat requests when assembly begins; restart acquisition after the existing incomplete timeout.
- Preserve command answers across re-request; discard old-stream deltas. While assembling, buffer deltas for replay.
- A sequence gap or engine change restarts acquisition. If replay restarts acquisition, retain later command answers from that replay batch.
- Keep request-queue suppression, command settlement, live-only open handling and stop cleanup.

## CAP-2: room-copy operations

Owner: `src/replica/room-copy.ts`, `createRoomCopy`.

Current state combines `writing`, `rerun`, `owed`, `cancelScheduled`, `writeRun`, `pageChanges` and `stopped`. Candidate operation phases are `idle`, `scheduled`, `reading`, `writing`, `verifying` and `stopped`. Ordinary and import operations need an explicit mode. This is not a required flat enum: scheduling and deferred work may need independent state while a write is active.

Required invariants:

- One active write lifecycle owns serialization and its completion handle. An import waits for the preceding ordinary write.
- A trigger during a write retains the required follow-up work. An unsuccessful or blocked write retains owed work as current policy requires.
- Saved-copy status, capacity, read outcome and compatibility notices remain independent of an active write. An old saved copy can exist while a new write runs.
- A stopped lifecycle does not imply cancellation of an already-started metadata call. Preserve current stop and demotion guarantees.

Preserve these cases:

- Ordinary writes read, merge, encode, measure, write and verify. Only read-back success clears the not-saved notice.
- Ordinary read/encoding/capacity failure preserves the previous copy; write or verification failure retains owed work and the required notice.
- A page visibility/resume change between the read and write prevents that ordinary write under the existing gate.
- Higher generations trigger adoption. Routine writes do not replace unreadable or older-format copies; newer-format copies remain protected.
- Import waits for older writes, verifies its generation and handles supersession. A failed import can remove a lower-generation copy under AD-9; ordinary-write preservation does not override that rule.
- A trigger during a verified import still produces the follow-up ordinary write fixed in TASK-50.

TASK-50 records a pre-existing limitation: import can continue after demotion. This refactor does not silently change that policy. Record any new defect separately with its evidence.

## CAP-3: catch-up and adoption

Owner: `src/replica/catch-up.ts`, `createCatchUp`.

The existing synchronous machine already returns decisions. Its remaining state-shape concern is the relationship between `state`, `ownNonce`, `catchUpTrigger`, `adoptionTarget` and `incompleteRetryMs`.

Candidate shape:

- An explicit initial state before the first request. The existing externally visible view still reports catching-up.
- Active catch-up with a nonce and trigger, with ordinary and adopting variants.
- Adoption with a target generation and incomplete-request retry state.
- Live with no active own nonce or adoption target.

GM link, completed-first-catch-up knowledge, late-answer history, held requests and drift observations are separate dimensions. In particular, `lastNonce` and accumulated answer parts survive an unanswered exit so a late complete answer can still count.

Preserve:

- Ordinary timeout or confirmed alone-GM handling can end catch-up; incomplete adoption retries instead.
- A failed adoption save leaves adoption open and keeps old data. The engine still owns incoming records, persistence and replica swap.
- Page return keeps an eligible active nonce; stale room-copy and party reads cannot finish a later request.
- Only all parts from one responder complete an answer. A late complete answer can update GM-answer knowledge after timeout.
- GM liveness comes from admitted GM messages, not party membership. GM-return re-request and pending-edit release retain their ordering.
- Drift catch-up can answer when ordinary catch-up cannot; held requests, answer suppression and ignored digests retain their existing rules.

Keep the current synchronous event/decision interface. Timers schedule calls into it; they do not decide liveness or completion themselves.

## Completion evidence

For each slice, record the previous cross-field invariants, their new owner and what callers must know before and after. The production path must consume the new state; a diagnostic wrapper over independently writable flags is insufficient.

Use existing behavioral checks through the current interfaces and the independent contracts named in `brownfield.md`. Typecheck supports the representation claim only. Complete the project's required checks before declaring an implementation task done.
