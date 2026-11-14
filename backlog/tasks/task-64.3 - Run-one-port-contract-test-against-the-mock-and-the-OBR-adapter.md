---
id: TASK-64.3
title: Run one port contract test against the mock and the OBR adapter
status: To Do
assignee: []
created_date: '2026-11-14T20:25:00Z'
labels:
  - architecture
  - tests
  - platform
dependencies:
  - TASK-64.2
parent_task_id: TASK-64
type: task
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The mock adapter (`src/platform/mock`, about 1750 lines) is a second implementation of the ports with its own room simulation, and the OBR adapter (about 316 lines) is tested only through three pure helpers. Nothing runs the same port scenarios against both, so the mock can drift from Owlbear and the app would still pass every test. CLAUDE.md states the consequence: the mock proves app logic only, and `deferred-work.md` lists many checks the owner must do in a live room. A contract test parametrized by an adapter factory closes part of that gap: on the mock it runs in `bun test`; on the OBR adapter it runs in the Playwright browser suite or in a harness that the owner runs against a live room. Start with the ports the engine depends on most: Storage (read, write, remove, list, failure kinds), Broadcast (LOCAL and REMOTE delivery, arrival order, `rate-limited`) and Metadata.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One contract test module takes an adapter factory and covers Storage, Broadcast and Metadata semantics the engine relies on, each scenario named after the behavior
- [ ] #2 The contract runs against the mock adapter in `bun test` and passes
- [ ] #3 The contract runs against the OBR adapter in `bun run test:browser` or a documented harness, with the scenarios it cannot run outside a live room listed and the reason recorded
- [ ] #4 Every mock divergence the contract finds is fixed in the mock or recorded in `deferred-work.md` with a live-room check
- [ ] #5 CLAUDE.md tests block states what the contract proves and what still needs the owner in a live room
- [ ] #6 The full check passes
<!-- AC:END -->
