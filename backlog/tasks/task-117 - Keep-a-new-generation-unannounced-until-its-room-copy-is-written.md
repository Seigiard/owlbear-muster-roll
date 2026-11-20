---
id: TASK-117
title: Keep a new generation unannounced until its room copy is written
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T06:19:00Z'
updated_date: '2026-11-19T18:53:00Z'
labels: []
dependencies: []
references:
  - formal/generation-adoption/GenerationAdoption.tla
  - .claude/skills/generation-adoption/SKILL.md
priority: medium
type: bug
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AD-9 requires the importing GM to write the room copy of a new generation before any client learns of it, so a client that hears the generation can always fetch its data. The code keeps that order only for `reset`. `replaceGeneration` in `src/replica/generation-flow.ts` sets `ownGeneration` before it awaits `roomCopy.writeImport`, and during that wait the GM, still live, answers `ping` with `alive` and `state-request` with `state` under the new generation (`engine.ts` catch-up interpreter, `catch-up.ts` `pingReceived` / `stateRequested`). A client that hears it moves to `catching-up/adopting` (`room-protocol.ts` → `seeGeneration`). If the importer closes the tab before the copy is written, no client holds the new data and the room copy still has the old generation: the client stays adopting, re-reading the copy and asking again, until the importer opens the room again. Found by the TLA+ model `formal/generation-adoption/` (config `finding-importer-leaves.cfg`, liveness `EventuallySettled`) and replayed on the real `createCatchUp` and `createGenerationFlow`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While a generation import waits for its room copy write, no message the importer sends (`alive`, `state`, or any other carrying a generation) names the new generation
- [x] #2 A client that heard the importer during the wait and then lost it (tab closed before the copy write ends) returns to `live` on the old generation, without waiting for the importer to come back
- [x] #3 A module or engine test reproduces the importer closing during `writeImport` and passes
- [x] #4 `formal/generation-adoption/check.sh` reports `finding-importer-leaves` as passing, and the config and the generation-adoption skill are updated to expect that
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
While a generation import or wipe writes its room copy, the importing GM now sends nothing that names the new generation: it does not vouch for its records, so it answers no ping and no state request; its ping timer sends nothing; and a dice roll fails before any dice show (20de031). A client that hears the importer during the write therefore never adopts, and stays live on the old generation if the importer closes. Engine tests pin the close during the write and the answers after it; roll-flow tests pin both roll checks; removing each guard turns its test red. The generation-adoption model gives an importing GM no vouch (a93984f): the former finding-importer-leaves config passes as importer-leaves.cfg (renamed, per the skill's rule for a fixed finding), with a player-peer twin, and bug-importer-answers.cfg brings the leak back. Accepted: a request that reaches the importer is held until its next catch-up ends, and players may show the GM offline if a copy write takes over 20 s. Checks: bun test 3610 pass, test:browser 587 pass, mutants 53/53, all generation-adoption configs as expected, drift ok.
<!-- SECTION:FINAL_SUMMARY:END -->
