---
title: '4.9 Ask the GM for Dice Extension Access'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: 'f791160b550fddc6420897c311b8ac4fca5f228b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-8-roll-dice-through-the-dice-extension.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The dicex fork (`/Users/seigiard/Projects/dicex`, `src/plugin/dicePlusProtocol.ts`) now lets an extension roll only after a GM allows it per room. Owner decisions: the first roll of an unknown extension waits for the GM's answer; with no GM online an extension cannot get access. Muster Roll's client (spec 4.8) does not know this protocol, so its first roll in a room can time out or fall back without telling anyone why. Backlog task: TASK-36 (follow-up).

**Approach:** Follow the fork's access protocol. The GM client asks for access up front at start, so the GM sees the dicex prompt before anyone rolls. Every probe names the `source`, and the client reads `permitted`. A roll while access is not yet granted still goes to the extension (dicex holds it for the GM's answer), with a longer result wait and a visible waiting text. A refusal falls back to a local roll.

## Boundaries & Constraints

**Protocol (verify against the fork source before coding):**
- `dice-plus/isReady` request gains `source: 'app.muster-roll'`; the reply may carry `permitted: boolean`. A reply without `permitted` (commercial Dice+) counts as permitted.
- `dice-plus/request-access` `{ requestId, source }`; replies on `app.muster-roll/access` `{ requestId, status }`: `allowed`, `denied`, `no-gm`, `pending`, then a second reply `allowed`, `denied` or `timeout`.
- `roll-error` `error` values `not-permitted` and `no-gm` are refusals of access.
- dicex holds a roll of a not-yet-allowed source up to 25 s (`ACCESS_DECISION_TIMEOUT_MS`).

**Always:**
- Only a GM client sends `request-access`, once per background start after the first ready probe that answers `permitted: false`, and again after a `timeout` reply only when a later probe still answers `permitted: false`.
- A roll when the last probe answered `permitted: false`: send it anyway; the result wait is the access wait plus the normal result wait (constants in the timing module). The window shows «Ждём разрешения ГМ…» instead of «Бросаем…» for that roll.
- `permitted: false` after a GM's `denied`: dicex refuses at once with `not-permitted`; the roll goes local with no extra wait.
- `not-permitted` and `no-gm` fall back to a local roll like any error, logged with the reason.
- Answers on `app.muster-roll/access` are parsed with zod and matched by `requestId`.

**Never:**
- Asking for access from a player client.
- Treating `pending` as permitted.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GM starts, not yet allowed | Probe answers `permitted: false` | GM client sends `request-access` once | N/A |
| Already allowed | Probe answers `permitted: true` | No access request; rolls as in 4.8 | N/A |
| Commercial Dice+ | Reply without `permitted` | Rolls as in 4.8 | N/A |
| Player starts, not allowed | Player client | No access request | N/A |
| Roll while pending | GM has not answered | Request sent; window shows «Ждём разрешения ГМ…»; GM allows → extension faces | N/A |
| GM denies or no answer | `not-permitted` | Local roll | Logged |
| No GM online | `no-gm` | Local roll at once | Logged |
| Denied earlier | Probe answers `permitted: false`, dicex refuses at once | Local roll | Logged |

</frozen-after-approval>

## Code Map

- `src/core/dice-plus.ts` -- schemas for `permitted`, access request and replies, access refusal codes.
- `src/replica/dice-extension.ts` -- probe with `source`, `permitted` state, access request, longer wait when not permitted.
- `src/replica/engine.ts` -- GM-only access request after start; roll outcome carries the waiting state.
- `src/core/ui-messages.ts`, `src/ui/sheet/dice-button.tsx`, `src/ui/copy.ts` -- the waiting text.
- `src/core/timing.ts` -- access wait.
- `src/platform/mock/dice-extension.ts` -- the fake models the access protocol.

## Tasks & Acceptance

**Execution:**
- [x] Core schemas and timing.
- [x] Client: probe with `source`, `permitted`, GM access request, longer wait, refusal fallback.
- [x] Window waiting text.
- [x] Fake extension with access states; engine tests for every matrix row; e2e for the waiting text and an allowed roll.

**Acceptance Criteria:** the matrix above.

## Implementation Notes

- Protocol checked against `dicex/src/plugin/dicePlusProtocol.ts`, `dicePlusBackgroundListeners.ts` and `dicePlusAccess.ts` (read only). It matches the spec: the probe reply carries `permitted` only when the probe names a `source`; `permitted` is `true` only for a stored `allowed`, so `false` means both "not answered yet" and "denied"; `request-access` answers on `${source}/access` with the stored answer, `no-gm`, or `pending` and then `allowed`, `denied` or `timeout`; a roll from a source with no answer waits for the GM (`ACCESS_DECISION_TIMEOUT_MS` 25 s) and gets `not-permitted` on a refusal or a timeout, `no-gm` with no GM in the room.
- Core. `src/core/dice-plus.ts`: `DICE_PLUS_REQUEST_ACCESS_CHANNEL`, `DICE_PLUS_ACCESS_CHANNEL` (`app.muster-roll/access`), `DICE_PLUS_NOT_PERMITTED`, `DICE_PLUS_NO_GM`; the probe schema takes an optional `source`, the ready reply an optional `permitted`; zod schemas for the access request, its status and its reply. `src/core/timing.ts`: `accessWaitMs: 25000` in `DICE_EXTENSION_TIMING`.
- Client (`src/replica/dice-extension.ts`). Sends go straight to `broadcast.sendMessage` with `LOCAL`, not through the paced send queue (see the change log). Every probe names `source: 'app.muster-roll'`. A reply with no `permitted` counts as permitted (one default, where the reply is parsed). Access is an explicit state: `permitted`, `pending`, `unknown` or `refused`. `ready()` answers `absent` or that state.
  - Probes. When the latest probe had no answer, a roll waits for a fresh probe, at most `probeWaitMs`. A late answer to the latest probe still counts for the next roll. Start retries (2 s, 4 s, 8 s) run as before and now send at once.
  - Transitions. A probe's `permitted: true`, an `allowed` answer, or any result for a waiting roll → `permitted`. A probe's `permitted: false` does not overwrite access granted after that probe started. `permitted: false` while `permitted` → `unknown`, and a GM client asks again (the extension forgot or changed its answer). `pending` → `pending`. `denied` or `no-gm`, and a `not-permitted` or `no-gm` roll error → `refused`. `timeout`, or no answer by `accessWaitMs + probeWaitMs` (the client's own deadline) → `pending` becomes `unknown`.
  - Asking. Only a GM client sends `request-access`, when a probe finds no access, once per start. These let a later probe ask again: `timeout`, `no-gm`, the client's own deadline, a failed send, permitted turning into not permitted, and a `not-permitted` roll error while permitted (revocation, which also asks at once). `becameGm()` probes, so a client promoted to GM asks when it has no access.
  - Rolls. One at a time, as before. A roll's result wait starts when its request goes out, after the roll before it, and is `resultTimeoutMs`, plus `accessWaitMs` when not `permitted`. The roll-error reasons `not-permitted` and `no-gm` get their own log text (`the GM has not allowed Muster Roll to roll dice in this room`, `no GM is in the room to allow Muster Roll to roll dice`). A refusal does not mark the extension gone.
- Engine. `absent` and `refused` roll locally at once, with no extension request. `pending`, and `unknown` with a GM in the room (this client's role or a GM in the party), send the window the roll outcome `{ code: 'waiting-access' }` before asking for faces. `unknown` with no GM sends the request with no waiting text, and dicex answers `no-gm` at once. `waiting-access` is a new member of the roll outcome union in `src/core/ui-messages.ts`. It is not an end: the window replaces it with the next outcome for the same id. A role change to GM calls `diceExtension.becameGm()`. Every roll logs one `console.info` line with its path: `Muster Roll rolled with the dice extension`, or `Muster Roll rolled locally:` with `unsupported dice`, `no dice extension answered`, `access refused` or `the dice extension gave no faces`.
- Window. `DiceButton` keeps the roll in progress on `waiting-access` and shows `copy.rollWaitingForGm` («Ждём разрешения ГМ…») instead of `copy.rolling`.
- Mock. `FakeDiceAccess` and `FAKE_DICE_ACCESS` live in `src/platform/mock/client-params.ts`. `startFakeDiceExtension(broadcast, playerId, answer, { access, promptTimeoutMs })` answers probes, access requests and rolls as dicex does. With no answer and a GM in the room, it holds access requests and rolls until `answerPrompt('allowed' | 'denied' | 'timeout')` or until `promptTimeoutMs` (25 s by default) times them out. `setGmInRoom(false)` answers held items with `no-gm`. `setAccess` changes the stored answer, as dicex's GM tools do. `accessRequests()` and `lastProbeId()` expose what it heard. `mock-dice-access` (`ClientParams.diceAccess`) sets the start state. An unknown value starts no fake, as a bad `mock-dice-faces` does.
- Tests. `src/replica/engine-dice-extension.test.ts` covers each matrix row and each transition above: one request despite a second probe; already allowed and the commercial reply; a player never asks; a pending roll with `waiting-access` then `rolled`; denied, a prompt timeout and `no-gm` go local and are logged; refused rolls go local with no request and no waiting text; `no-gm` re-arms the request; revocation; dicex forgetting the answer; the client's own deadline; a failed access send; promotion to GM; allowed at start → no waiting; a player's second roll after a result → no waiting; a stale probe answer does not undo access; the access wait; a queued roll's timer; a fresh probe before a roll; a late probe answer; the path logs. Three 4.8 tests changed with the probe-wait amendment: a roll with no answer last time now waits for a fresh probe. `tests/dice-extension.e2e.ts`: the GM's background asks at start; a press shows «Ждём разрешения ГМ…»; after `answerPrompt('allowed')` the notification shows the fake's face and the line clears. Each guard went red under a mutation of its code. The 4.8 test "when no result comes in time" also fails when a permitted roll gets the access wait.

## Spec Change Log

- Amendment, owner live finding (deployed build 2ed3a42 with the dicex fork): the first roll after a reload missed the dice extension. It rolled locally at once, and the second roll reached dicex. Cause: the start probe went through the paced send queue, which was busy with catch-up traffic, so its 1 s wait ran out before it was sent. Change: (1) LOCAL dice messages (probe, `request-access`, `roll-request`) go straight to `broadcast.sendMessage` and skip the send queue. LOCAL never reaches the network and is not rate-limited. (2) When the last probe had no answer, a roll waits for a fresh probe, at most `probeWaitMs`, before it decides. This replaces 4.8's "a probe never delays a roll when no extension answered last time". (3) A late answer to the latest probe still marks the extension ready. (4) Each roll logs one `console.info` line that names its path, for live diagnosis.
- Amendment, review: a client that knows access is refused (the GM's `denied`, a `no-gm` answer, or a `not-permitted` / `no-gm` roll error) rolls locally at once. It sends no extension request and shows no waiting text, until a probe or an access answer says otherwise. This narrows "send it anyway" in Always to the states where the extension may still say yes (`pending`, `unknown`). The waiting text shows only for `pending`, and for `unknown` with a GM in the room.
- Amendment, review: a roll's result wait starts when its request goes out after the roll before it, not when it is asked for. This replaces 4.8's "a roll from when it is asked for".

## Review Triage Log

Round 1 (Blind Hunter, Edge Case Hunter, Verification Gap) and the owner's live-room finding:

| Finding | Source | Disposition |
| --- | --- | --- |
| A refusal is forgotten: each roll still waits and shows the waiting text | BH, EC | patch: explicit access state with `refused`; refused rolls go local at once |
| Waiting text shown for denied, no-GM and stale-probe cases | BH, EC | patch: only while `pending`, or `unknown` with a GM in the room |
| Revoked access stays permitted; a probe's `false` can overwrite a later `allowed` | EC | patch |
| No client-side timeout for its own access request; `no-gm` and forgotten decisions never re-ask | BH, EC | patch |
| A queued roll's timer runs before it is sent | EC | patch: timer starts at send |
| A player promoted to GM never asks up front | BH | patch: `becameGm()` probes and asks |
| `allowed` at start, player learning by a successful roll, failed access send untested | VG | patch: tests |
| Probe sent through the busy room queue misses its 1 s deadline at start | owner live room | patch: LOCAL dice messages sent directly |
| First roll after a reload goes local | owner live room | patch: a roll waits up to 1 s for a fresh probe (Spec Change Log) |
| No log line for a local roll | owner live room | patch: one `console.info` per roll naming its path |
| Fake types in the wrong module; unknown mock param ran as allowed; fake lacked GM-leave and timeout | BH | patch |

## Design Notes

- The GM asks at start, so in normal play the GM answers the prompt before the first roll and no roll ever waits.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room with the fork: the GM opens the room, the dicex prompt asks about `app.muster-roll`; Allow; a player roll shows 3D dice.
