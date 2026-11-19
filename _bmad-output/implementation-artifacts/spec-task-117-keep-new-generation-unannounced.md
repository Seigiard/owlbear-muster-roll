---
title: 'TASK-117: Keep a new generation unannounced until its room copy is written'
type: 'bugfix'
created: '2026-11-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AD-9 requires the importing GM to write the new generation's room copy before any client learns of it. The code keeps that order only for `reset`: from `store-written` to the end of `writeImport` (`generation-flow.ts`, phase `importing`) `generationFlow.generation()` is already the new generation, and the importer still answers `ping` with `alive` and `state-request` with `state`, sends its own `ping`, and sends dice rolls from the window, all under the new generation. A client that hears one adopts; if the importer's page closes before the copy is written, no source of the new generation remains and that client stays adopting until the importer returns (formal finding `finding-importer-leaves.cfg`, TASK-117).

**Approach:** While `generationFlow.importing()` is true the importer sends no room message other than its own `reset`: it does not vouch for its records, so `canAnswer` refuses `state` and `alive`; its ping timer sends no `ping`; and a dice roll that would go to the room ends with the `failed` outcome ("Бросок не удался. Попробуйте ещё раз."), as a GM command does during an import. Pin it with an engine test of the importer closing during `writeImport`, and change the generation-adoption model the same way so `finding-importer-leaves` passes.

</frozen-after-approval>

## Implementation Notes

- `engine.ts`: `vouches` for `createCatchUp` is false while `generationFlow.importing()`. `canAnswer` needs it, so the importer answers no `ping` and no `state-request`. `sendPing` returns early while importing.
- `roll-flow.ts` gets an `importing` port. `handleRollRequest` checks it first, so no 3D dice show for a roll that cannot be sent. `sendRoll` checks again for an import that starts while the dice roll. The outcome is the generic `failed`. A GM command during an import is rejected with reason `importing` instead, so the Intent's "as a GM command does" holds for the effect, not the wording.
- A wipe runs the same `replaceGeneration`, and `isImporting` covers it, so a wiping GM is silent the same way.
- Accepted: a `state-request` that reaches the importer is held, as by any GM that cannot answer (`catchUpStateRequested` → `holdRequest`), until its next catch-up ends. The asker asks again on its own timer.
- Accepted: the importer sends nothing for the whole copy write. A write longer than `gmLinkTimeoutMs` (20 s) would show the GM offline to players until its next message. The write is one metadata write.
- Model: `Vouches(r)` in `GenerationAdoption.tla` drives `Deliver` and `SpeakAlive`. `finding-importer-leaves.cfg` became `importer-leaves.cfg`, with all safety rules and both liveness rules, and `importer-leaves-player.cfg` covers a player peer. `bug-importer-answers.cfg` brings the leak back and fails. `bug-copy-ignores-superseded.cfg` now needs `MaxCopyFails = 1`: since the fix an importer hears a newer generation only after that copy is written, unless the copy did not fit. Every model's sync moved to `20de031`.
- AD-9 in `ARCHITECTURE-SPINE.md` states the rule.
- Review: Blind Hunter, 12 findings. Patched: the early roll check, tests for the ping guard and for answers after the write, the `vouches` comment, the test name, the skill cross-reference, the config header and properties, AD-9, these notes. Recorded as accepted: held requests, GM silence during the write, wipe coverage.
- Checks: `oxfmt`, lint, typecheck, `bun test` (3610 pass), `test:browser` (587 pass), `mutants` (53 of 53 killed), build, `formal/generation-adoption/check.sh` (22 configs as expected), `formal/drift.sh`. Removing each guard turns its test red.
