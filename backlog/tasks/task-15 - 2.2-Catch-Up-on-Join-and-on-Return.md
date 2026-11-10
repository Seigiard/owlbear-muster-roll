---
id: TASK-15
title: 2.2 Catch Up on Join and on Return
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T23:03:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-14
references:
  - _bmad-output/planning-artifacts/epics.md
documentation:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/preset-format.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
  - >-
    _bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/EXPERIENCE.md
  - >-
    _bmad-output/planning-artifacts/ux-designs/ux-owlbear-muster-roll-2026-11-10/DESIGN.md
type: feature
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a GM or a player, I want my client to get the current data when I join or come back, So that I never work from stale data.

Story 2.2 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a client **When** it starts, a page becomes visible, Page Lifecycle `resume` fires, the browser `online` event fires, its role changes, or it sees a higher generation **Then** it enters `catching-up` and broadcasts `state-request` with a nonce `r` (AD-7, FR9, FR11) **And** a client already in `catching-up` keeps its current `r`, unless the trigger is a higher generation or a role change, which issue a new `r` and discard partial answers **And** a GM client first merges all its persisted records of the current generation
- [x] #2 **Given** a GM client that is not `catching-up` **When** a `state-request` arrives **Then** it answers after a random short delay, unless it has already seen an answer to `r` **And** the `state` messages echo `r`, carry `i of n`, hold complete deflated records and are each under the size limit
- [x] #3 **Given** a client in `catching-up` **When** it holds all `n` messages of one responder for its own `r`, or the timeout passes **Then** it leaves `catching-up` **And** a partial answer counts as no answer, and every `state` message is still merged whenever it arrives
- [x] #4 **Given** a GM client whose confirmed party read shows no other GM connection **When** it enters `catching-up` **Then** it merges its persisted records and leaves `catching-up` with no wait for the timeout
- [x] #5 **Given** a GM edit during `catching-up` **When** the GM types **Then** the value shows at once with no mark, the edit waits in the pending queue and takes `c` on exit, and inputs stay enabled (UX-DR30) **And** the pending queue holds one field-patch entry per key, so two edits of one row combine **And** all GM intents made during `catching-up` replay on exit in arrival order, and patches to one key combine in place **And** a queued create shows its sheet at once and focuses its name
- [x] #6 **Given** the first catch-up has not ended **When** the window renders **Then** it shows the tab bar from known data and "Загрузка…", and never an empty state (UX-DR26) **And** the role is read before any data renders **And** this state replaces the Story 1.5 gate: the no-preset state shows only after the first catch-up ends **And** a player client stays on "Загрузка…" after catch-up until player views exist
- [x] #7 **Given** a GM client in `catching-up` **When** Settings renders **Then** upload buttons and "Скачать пресет" are disabled with "Загрузка…" (UX-DR30) **And** `replica` checks the state again when the command arrives and refuses it during `catching-up`
- [x] #8 **Given** a client whose role changes to GM **When** catch-up ends **Then** all held records are persisted under the current generation (AD-11)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add state-request and state schemas and timing constants.
2. Build the catch-up state machine, answering and exit rules in replica.
3. Add the pending queue with combining, a dry-run view and replay on exit.
4. Carry the sync state to windows: loading state, Settings disabled.
5. Verify with engine tests on the in-memory room and Playwright with several clients.
Spec: _bmad-output/implementation-artifacts/spec-2-2-catch-up-on-join-and-on-return.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-2-2 (see its Implementation Notes): state-request/state schemas and chunking in core, catch-up state machine, answering, exit rules, alone-GM exit, role re-read (party change and player.onRoleChange), player generation adoption, persist-on-promotion, pending queue with combining and dry-run view, preset-upload refusal while catching-up, window loading gate and Settings controls disabled during catch-up. Tests: core, engine-catch-up (in-memory room), tests/catch-up.e2e.ts. Uncommitted; awaiting review.

All eight criteria verified on the mock room with engine tests and real pages in Playwright. Not yet observed in a live Owlbear room, where hidden-tab timers and real party events matter.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Clients now catch up to full state on start and on return. replica enters catching-up on start, page visible, resume, online, a role change or a higher generation; a GM first merges its persisted records, then any client broadcasts state-request with a nonce. A live GM answers after a random 20-300 ms delay unless another answer to that request was seen; state messages carry r, i of n and deflated records under the size limit. A client leaves on a complete answer from one responder, on the 4 s timeout, or at once when a confirmed party read shows no other GM. GM intents made meanwhile wait in a pending queue (field patches combine per key), show at once through a dry-run view, and replay in order on exit. Windows show the tab bar and "Загрузка…" until the first catch-up ends; Settings disables upload and download during catch-up, and replica refuses preset-upload then. A promoted player persists under the highest stored generation. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
