---
id: TASK-5
title: 1.3 Keep the GM's Records Safe in the Browser
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T17:08:00Z'
labels:
  - epic-1
milestone: m-0
dependencies:
  - TASK-4
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
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As the GM, I want every record stored in my browser with a version, So that a stale tab cannot overwrite newer data.

Story 1.3 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: The GM loads a preset for any game system, creates and fills characters and NPCs, and keeps every change after a reload. The extension is live on its permanent URL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** two records of one key **When** `core/merge` compares them **Then** the record with the higher `(c, a)` wins, comparing `c` as a number and `a` as a string (AD-3) **And** property tests show merge is commutative, associative and idempotent
- [x] #2 **Given** a record candidate **When** it is parsed **Then** only the AD-2 key forms are valid, and `d: null` is a tombstone **And** a field value is a JSON number, string or boolean, and an empty field has no key
- [x] #3 **Given** a new edit of a key **When** a version is minted **Then** `c` is the highest known `c` for that key + 1, and device time is not part of the version **And** one connection never emits one `(k, c, a)` with two different `d`
- [x] #4 **Given** a GM client writes a record **When** the storage port stores it **Then** the key is `mr1:{roomId}:{n}:{a}:{k}`, and one synchronous step reads that key, merges and sets it (AD-11) **And** a lower-version write from a stale tab leaves the newer stored record (FR1)
- [x] #5 **Given** a storage write that fails **When** `core` or the storage port handles it **Then** the caller gets a result that reports the failure, and no exception is thrown for this expected case
- [x] #6 **Given** no import has happened **When** a client reads the room generation **Then** it is `{ n: 0, a: "" }`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add record schemas and one merge to src/core.
2. Add a per-connection version minter and a record store to src/replica.
3. Make the storage port return results for failures.
4. Verify with property and unit tests.
Spec: _bmad-output/implementation-artifacts/spec-1-3-keep-records-safe-in-the-browser.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schemas, merge, storage key, result-returning StoragePort, version minter and record store per the spec. bun run lint, bun run typecheck, bun test exit 0; 28 mutations of the new code each turned a test red. Not committed; review loop pending.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the record schemas, one merge, the AD-11 storage key, a per-connection version minter and a record store that reads, merges and sets in one synchronous step. The storage port now returns results, so a failed write is reported and not thrown. Verified: lint, typecheck, unit and property tests, Playwright, build. Not proven through a real browser reload; TASK-6 is the first production caller. Two follow-ups are in deferred-work.md.
<!-- SECTION:FINAL_SUMMARY:END -->
