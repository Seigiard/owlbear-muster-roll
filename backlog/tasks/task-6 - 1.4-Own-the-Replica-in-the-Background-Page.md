---
id: TASK-6
title: 1.4 Own the Replica in the Background Page
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T17:44:00Z'
labels:
  - epic-1
milestone: m-0
dependencies:
  - TASK-5
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
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want the data to live in the background page, So that closing the window loses nothing.

Story 1.4 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** the background page starts on a GM client **When** it loads **Then** `src/replica` merges all persisted records of the current generation (AD-10) **And** a stored record that fails its schema is skipped, raises the local-save notice, and counts as absent when that key is next written **And** a player client persists nothing (AD-11)
- [x] #2 **Given** a window opens **When** it sends `projection-request` on `app.muster-roll/ui` with destination `LOCAL` **Then** it receives a full projection, then deltas, and the projection holds records and notices, read through `core/visibility(role)` (AD-10) **And** `core/visibility` is a pass-through until player rules exist, and until then a player client shows only "Загрузка…" **And** the window repeats `projection-request` until the first part arrives, and restarts only after a timeout with an incomplete set, so a window that loads before the background page still gets one **And** a request carries a window nonce and the projection echoes it, so other windows ignore a projection that is not theirs **And** a projection split across messages carries `i of n` and a sequence number, and the window buffers deltas until it is complete
- [x] #3 **Given** a window sends a command **When** `replica` handles it **Then** the command passes a zod schema in `core` and carries an intent, never a whole record **And** an echo of a message causes no second effect
- [x] #4 **Given** a window is closed **When** the GM opens it again **Then** the same data shows (FR1)
- [x] #5 **Given** many sends on either channel **When** they leave the client **Then** one serial queue spaces them, starting at 50 ms, and `RateLimitHit` is waited out with backoff (AD-12, NFR4) **And** one function splits batches so each message is under 15000 UTF-8 bytes of JSON, and a record that cannot fit one message is refused at input with an error (NFR3)
- [x] #6 **Given** any timeout, pause, delay or send spacing **When** code needs the value **Then** it reads one named constants module with stated starting values, and tests inject them
- [x] #7 **Given** a local write fails **When** the projection reports the notice **Then** a status banner under the tab bar shows "Не удалось сохранить в браузере. Скачайте снимок." at full window width, as a live region (UX-DR24) **And** the banner disappears when no failed or corrupt key remains
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add timing constants, visibility, UI message schemas and the message size function to core.
2. Add the serial send queue and result-returning broadcast port.
3. Build the replica engine in the background page and the window client.
4. Show the local-save banner from notices.
5. Verify with unit tests, an engine and client integration test, and Playwright with real pages.
Spec: _bmad-output/implementation-artifacts/spec-1-4-own-the-replica-in-the-background.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the replica engine, the window client, the projection store, the paced send queue, the size function and the banner. Verified with bun test, lint, typecheck and bun run test:browser.

All seven criteria verified on the mock adapter with real background and window pages in Playwright. Real Owlbear LOCAL traffic is not yet observed; the owner's next live-room load is the first check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The background page now owns the replica: it loads persisted records, answers windows with a projection and deltas, applies intent commands with echo protection, and raises the local-save notice shown as a banner. All sends go through one paced queue per page, with backoff and the 15000-byte split. Verified on the mock adapter: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room. Four follow-ups are in deferred-work.md.
<!-- SECTION:FINAL_SUMMARY:END -->
