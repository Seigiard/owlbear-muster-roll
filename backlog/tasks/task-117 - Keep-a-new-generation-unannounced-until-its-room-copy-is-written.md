---
id: TASK-117
title: Keep a new generation unannounced until its room copy is written
status: To Do
assignee: []
created_date: '2026-11-19T06:19:00Z'
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
- [ ] #1 While a generation import waits for its room copy write, no message the importer sends (`alive`, `state`, or any other carrying a generation) names the new generation
- [ ] #2 A client that heard the importer during the wait and then lost it (tab closed before the copy write ends) returns to `live` on the old generation, without waiting for the importer to come back
- [ ] #3 A module or engine test reproduces the importer closing during `writeImport` and passes
- [ ] #4 `formal/generation-adoption/check.sh` reports `finding-importer-leaves` as passing, and the config and the generation-adoption skill are updated to expect that
<!-- AC:END -->
