---
id: TASK-17
title: 2.4 Show Whether a GM Is Answering
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:37:00Z'
updated_date: '2026-11-10T23:59:00Z'
labels:
  - epic-2
milestone: m-1
dependencies:
  - TASK-16
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
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a player, I want to see when no GM client responds, So that I do not assume the table is live.

Story 2.4 of `_bmad-output/planning-artifacts/epics.md`. Other stories are named there by number. Epic goal: Players read every character and no NPC. Edits sync live between GM tabs and devices. The room copy lets players read with no GM and lets the GM re-enter from another device.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **Given** a client with no GM-origin message for half the timeout **When** the timer fires **Then** it sends `ping` (AD-6)
- [x] #2 **Given** a GM client that is not `catching-up` **When** a `ping` arrives **Then** it answers `alive` on receipt with the generation and the digest, which is the XOR of a hash of `(k, c, a)` over all records
- [x] #3 **Given** a player client, whatever the party list shows **When** no GM-origin message arrives within the timeout **Then** `gmLink` is `offline`, and the banner shows "Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку." (UX-DR24, FR15) **And** `replica` alone sets `gmLink`, the party list never sets it, and the projection carries it to every window **And** `gmLink` starts `offline` with no banner until the first catch-up ends
- [x] #4 **Given** a GM client, also one alone in the room **When** no other GM client answers **Then** it never shows the no-GM banner, because its own edits apply
- [x] #5 **Given** a hidden GM tab that still answers **When** a client pings it **Then** `gmLink` stays `online` (NFR11)
- [x] #6 **Given** a GM-origin message after an offline period **When** it arrives **Then** `gmLink` becomes `online`, and the banner disappears
- [x] #7 **Given** `alive` from one GM client of the client's own generation **When** it shows a different digest twice in a row **Then** the client enters `catching-up` (AD-7) **And** after a catch-up that held all `n` messages from that GM client, its digest is ignored until it changes, so a lagging GM does not cause a loop, and a timeout exit does not start the ignore
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the record digest and ping/alive schemas.
2. Own gmLink in replica: ping timer, alive answer, drift detection with the ignore rule.
3. Carry gmLink to windows; show the no-GM banner for players.
4. Verify with engine tests and Playwright with GM and player clients.
Spec: _bmad-output/implementation-artifacts/spec-2-4-show-whether-a-gm-is-answering.md
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented per spec-2-4: core/digest.ts (FNV-1a XOR digest), ping/alive schemas, TIMING.gmLinkTimeoutMs=20000, engine gmLink with ping/offline timers, alive answer on receipt, drift detection with the AD-7 ignore rule, gmLink in sync state, no-GM banner for players (src/ui/banner-message.ts). Tests: src/core/digest.test.ts, src/replica/engine-liveness.test.ts, src/ui/banner-message.test.ts, tests/liveness.e2e.ts. All verification commands exit 0.

All seven criteria verified on the mock room with engine tests and Playwright with GM and player clients. A hidden GM tab is covered by an engine test only; Playwright cannot hide a tab. Not yet observed in a live Owlbear room.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Players now see whether a GM answers. replica owns gmLink (starts offline): any admitted GM-origin message sets online; after half of the 20 s timeout plus jitter a client pings; after the full timeout gmLink turns offline. A live GM answers ping at once with alive { g, digest }, the XOR of a 32-bit FNV-1a over length-prefixed (k, c, a). The projection carries gmLink; a player window shows "Нет связи с ГМ…" after the first catch-up, below local-save-failed and new-version; a GM never sees it. Drift: two differing same-generation alives from one GM, at least half a timeout apart, start a catch-up; a GM in a drift catch-up still answers state-request, so two drifting GMs converge; after a complete answer, both the responder's and the drifting GM's digests are ignored until they change. Verified on the mock: lint, typecheck, unit tests, Playwright, build. Not yet observed in a live Owlbear room.
<!-- SECTION:FINAL_SUMMARY:END -->
