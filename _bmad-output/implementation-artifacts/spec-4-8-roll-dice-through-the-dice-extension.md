---
title: '4.8 Roll Dice Through the Dice Extension'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_commit: '847c823994c9251edd29713c7836b61ea6a8cab6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-evaluate-dice-formulas-safely.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-roll-a-dice-cell-and-show-the-result.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A dice cell rolls with `Math.random` in the roller's replica and shows only a notification. Players want real 3D dice. Backlog task: TASK-36, whose five acceptance criteria apply in full. The research in TASK-36 notes chose the Dice+ broadcast protocol, implemented by the `dicex` fork (`Seigiard/dicex`, deployed at `https://seigiard.github.io/dicex/manifest.json`) and by the commercial Dice+.

**Approach:** The roller's background page keeps rolling the formula itself (Story 4.1 parser and evaluator, no eval), but takes the dice faces from the dice extension when one answers in the room. It sends the formula's dice terms as Dice+ notation on the local client, waits for the per-die values, and feeds them to the evaluator in tree order. The notification and the comparison outcome then use those faces. With no dice extension, or a formula the extension cannot roll, the roll is local as in Story 4.2.

## Boundaries & Constraints

**Protocol (Dice+, all messages with `destination: 'LOCAL'`):**
- Probe: send `{ requestId, timestamp }` on `dice-plus/isReady`; a reply on the same channel with the same `requestId` and `ready: true` means ready. Ignore messages without `ready`.
- Request: `dice-plus/roll-request` with `{ rollId, playerId, playerName, rollTarget, diceNotation, showResults: false, timestamp, source: 'app.muster-roll' }`. `playerId` is this client's own player id (the extension refuses any other).
- Result on `app.muster-roll/roll-result`: `{ rollId, …, result: { totalValue, rollSummary, groups: [{ description, diceType, dice: [{ value, kept }], total, isNegative }] } }`. Error on `app.muster-roll/roll-error`: `{ rollId, error, notation }`. Parse both with zod; match by `rollId`; drop anything else.
- `rollTarget`: `everyone` for a character sheet, `gm_only` for an NPC sheet.

**Always:**
- The dice terms (`NdM`) of the formula, from both sides of a comparison, in the evaluator's tree order, become one notation `N1dM1+N2dM2+…`, every term positive; the evaluator applies signs and arithmetic itself.
- A formula goes to the extension only when every term has `M` in {4, 6, 8, 10, 12, 20, 100}, each `N` ≤ 20, and the total dice ≤ 50. Otherwise the roll is local.
- A result is used only when it has one group per term in order, each group's `diceType` is `d{M}` and has exactly `N` dice with integer values in 1..M. Any mismatch counts as an error.
- The evaluator takes faces through an explicit face source (sides → face), with the current `Math.random` source as the default. Do not encode faces through `RandomSource`.
- Readiness: probe at background start and again when a roll would use it and the last probe is older than 60 s; wait at most 1 s. A roll uses the extension only when the latest probe answered ready. A probe never delays a roll when no extension answered last time; it refreshes in the background.
- An error reply, a malformed result, or no result within 30 s → the roll is made locally instead, and the error is logged. The window's "rolling" state lasts until the roll outcome as today.
- Timing constants go into the timing module.
- AC 1: the task notes already record the choice; add the fork URL and manifest URL to the task notes at close.

**Never:**
- A second local roll after a valid extension result.
- Sending a roll request for another player, or from a client that is not the roller.
- Any change to the room protocol or the roll message other clients receive: they still receive the evaluated roll from the roller as in Story 4.2.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Extension ready, character | `1d20 + str` | Request `1d20`, target `everyone`; notification uses the extension's face | N/A |
| Extension ready, NPC | GM rolls an NPC cell | Target `gm_only`; notification only on GM clients as today | N/A |
| Comparison | `1d20 <= str - 2*str_tired` | Faces from the extension; outcome compares them | N/A |
| Several terms | `2d6 + 1d8 - 1d4` | Notation `2d6+1d8+1d4`; evaluator subtracts the d4 | N/A |
| No dice | `str + 2` | No request; local evaluation | N/A |
| Unsupported sides | `1d3` or `1d1000` | Local roll | N/A |
| Too many dice | `30d6` or 60 dice in total | Local roll | N/A |
| No extension | Probe unanswered | Local roll, no delay | N/A |
| Error reply | `roll-error` for the `rollId` | Local roll | Logged |
| Bad result | Wrong group count, type, count or value | Local roll | Logged |
| No result | 30 s pass | Local roll | Logged |
| Stray messages | Other `rollId`, unparsable data | Ignored | N/A |
| Field error | Formula names an empty field | Error as today; no request sent | N/A |

</frozen-after-approval>

## Code Map

- `src/core/formula-evaluate.ts`, `src/core/dice-roll.ts` -- face source; a helper that lists a formula's dice terms in tree order.
- New `src/core/dice-plus.ts` -- zod schemas, notation building, result validation; pure.
- New `src/replica/dice-extension.ts` -- probe, request, wait, timeouts over the broadcast port.
- `src/replica/engine.ts` -- `handleRollRequest` / `evaluateRoll` / `sendRoll`: ask the dice extension for faces before evaluating; fall back to local.
- `src/core/timing.ts` -- probe wait, probe age, result timeout.
- `src/platform/mock/` -- a fake dice extension for tests (answers the probe, returns given faces, or errors, or stays silent).

## Tasks & Acceptance

**Execution:**
- [x] Core: dice term listing, notation, result schema and validation, face source; unit tests for every data row.
- [x] Replica: dice extension client with probe, request and timeouts; engine wiring with fallback; engine tests for every behavior row with the fake extension.
- [x] Mock: fake dice extension; one e2e that rolls with it and checks the notification shows the fake's face.

**Acceptance Criteria:** the five criteria of TASK-36.

## Implementation Notes

- Core. `evaluateFormula` takes a `FaceSource` (`sides → face`); the default is `randomFaces(Math.random)`, and the evaluator still clamps every face into 1..sides. `listedFaces` hands out `{ sides, face }` pairs in order and throws on a sides mismatch or a list that runs out (only a broken caller can cause either; the engine catches it and answers `failed`). `formulaDiceTerms` lists the `NdM` terms in the evaluator's order with an exhaustive switch. `src/core/dice-roll.ts` splits `rollDiceCell` into `prepareDiceRoll` (label, terms, and a `roll(faces)` over the values captured at the request) and the roll itself.
- dicex result shapes, checked in `dicex/src` (`resolveNotationAgainstSet`, `getDiceToRoll`, `buildDiceResults`, `dicePlusResultBuilder`, `getCombinedDiceValue`, `sets/diceSets.ts`, `dicePlusPendingRequest`). dicex merges the counts per die type and rolls in its dice set order (d4, d6, d8, d10, d12, d20, d100), then fills each notation group from the next dice of its type; a group whose next die is of another type stays short. So `src/core/dice-plus.ts` (`dicePlusDice`) sends the terms merged by sides and in that order (`2d6 + 1d8 - 1d6` → `3d6+1d8`, `1d20 + 1d4` → `1d4+1d20`), and `dicePlusFaces` checks the groups against that and maps the faces back to tree order. A basic dicex roll reports raw faces, so a d10 that shows 10 comes back as `0`; a d10's `0` counts as 10. A d100 comes back as a d100 group of the tens beside a stray d10 with no combined face, so d100 is not sent and rolls locally. Supported sides: 4, 6, 8, 10, 12, 20; at most 20 per term and 50 in all. The result schema reads only `rollId`, `groups[].diceType` and `groups[].dice[].value`.
- dicex keeps one pending request and replaces it on the next, so `src/replica/dice-extension.ts` sends one roll at a time: each request waits until the one before it has its answer.
- Waits count from their start, the send queue's pace included: a probe from when it starts, a roll from when it is asked for (time spent behind an earlier roll counts). Messages still go through the send queue (AD-12); `sendNow` does not report a failed send, which the readiness rules need.
- Readiness. The latest probe decides. A ready extension is re-probed after 60 s, and the roll waits for that probe (at most 1 s). After no answer, every roll starts a probe in the background and never waits. A start probe with no answer is tried again 3 times, after 2 s, 4 s and 8 s, for an extension that loads after Muster Roll. A roll with no result in time, or a request that could not be sent, marks the extension gone and starts a probe. An error reply is matched by `rollId` alone and ends the wait at once; its text is logged when it has one.
- Engine. The engine probes at start. On a roll request it reads the values once and rolls locally first: a field error, or an arithmetic error with the local faces, is answered with no request. With a supported formula and a ready extension it asks for faces for its own player id and evaluates the captured values with them. An error reply, a bad result, a failed send or no result in time log `Muster Roll rolled locally, as the dice extension gave no faces:` with the reason, and the local roll goes out. Faces from the extension that give an arithmetic error (`10 / (1d6 - 3)` with a 3) answer `arithmetic` and send no roll, because the 3D dice already showed. A page that stops during a wait logs nothing and sends nothing.
- Window. While a roll waits, the line under its dice button shows the catalog's `rolling` («Бросаем…») in `text-text-muted`, because a wait can now last seconds.
- Timing. `DICE_EXTENSION_TIMING` in `src/core/timing.ts` (`probeWaitMs`, `probeMaxAgeMs`, `resultTimeoutMs`, `startProbeRetries`, `startProbeRetryMs`), injected through the engine option `diceTiming`. It is a separate constant, like `LINK_PICKER_TIMING`, so the `Timing` fixtures in other tests stay as they are. No test checks that the engine falls back to the default: with the real waits (1 s and up) it would be slow.
- Mock. `src/platform/mock/dice-extension.ts` (`startFakeDiceExtension`) acts like dicex: it answers probes (unless set not ready), rolls only requests for its own player, and builds results in dicex's shapes (dice set order, short groups for out-of-order terms, d10 as `0`, d100 as tens plus a stray d10). It answers with listed faces (in dicex's rolling order), a custom result, an error, or nothing. A background page with the `mock-dice-faces` URL param (whole faces from 1, no empty segments) starts it before the engine and exposes it as `window.mockDiceExtension`.
- Tests. `src/core/dice-plus.test.ts`; new cases in `formula-evaluate.test.ts`; `src/replica/engine-dice-extension.test.ts` (matrix rows, dicex shapes, serialization, readiness, failed sends, stop during a wait, arithmetic after the dice); `tests/dice-extension.e2e.ts` (faces on every client, the busy line). Each new behavior was seen red under a mutation of its code: faces from the local roll, no d10 mapping, no tree-order mapping, no serialization, no gone mark, no background probe, no start retries, no stop check, no busy text.
- AC 1 note for close (backlog not touched here): fork `https://github.com/Seigiard/dicex`, manifest `https://seigiard.github.io/dicex/manifest.json`.

## Spec Change Log

## Review Triage Log

Round 1 (Blind Hunter, Edge Case Hunter, Verification Gap):

| Finding | Source | Disposition |
| --- | --- | --- |
| dicex fills groups in dice-set order, not notation order | EC, BH | patch: same-sided terms merged and sent in set order; faces mapped back to tree order |
| dicex sends a d10 showing 10 as `0` | EC | patch: normalized |
| dicex reports d100 as a tens-only group | EC | patch: d100 rolls locally |
| dicex keeps one pending request | EC | patch: extension rolls serialized |
| Fake extension used shapes dicex never sends | EC | patch: fake models dicex |
| Removed extension stalls rolls 30 s each | BH, VG | patch: timeout or failed send marks not-ready and re-probes; test |
| Extension loading after Muster Roll stays unused 60 s | BH, EC | patch: start-up probe retries; background probe per roll when not ready |
| Error reply without `notation` ignored | BH | patch: matched by `rollId` only |
| Waits not bounded from the press | BH | patch: deadlines from the request |
| No busy state during a long wait | BH | patch: «Бросаем…» under the button |
| Failed probe and roll sends, stop during a wait, extension faces with arithmetic error untested | VG, BH | patch: tests; refusal kept (no local roll after shown dice), comment fixed |
| `formulaDiceTerms` not exhaustive; `listedFaces` returns 1 past the list | BH | patch |
| Loose log assertions, restating timing test, fragile `characterRow`, URL faces parsing | BH, EC | patch |
| Same-sided merge, d10 and d100 rules unverified against a live room | EC | defer: owner live check with the fork |

## Design Notes

- Faces, not totals: the extension's total cannot apply our field values, `floor`, `ceil` or the comparison, so only the dice come from it.
- `showResults: false`, because Muster Roll shows its own notification with the formula's result.
- A fallback after a lost result can roll different numbers than the 3D dice showed. That trade keeps a roll from hanging when the extension is closed or slow.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room with the fork installed: roll a character cell, every client sees 3D dice and the notification shows the same faces; roll an NPC cell as GM, players see nothing; remove the fork, rolls still work.
