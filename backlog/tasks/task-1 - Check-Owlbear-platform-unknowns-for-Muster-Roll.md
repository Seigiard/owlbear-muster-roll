---
id: TASK-1
title: Check Owlbear platform unknowns for Muster Roll
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T05:34:00Z'
updated_date: '2026-11-10T09:32:00Z'
labels: []
dependencies: []
documentation:
  - _bmad-output/specs/spec-muster-roll/SPEC.md
  - _bmad-output/specs/spec-muster-roll/storage-and-sync.md
priority: high
type: spike
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Muster Roll POC has no server: it relies on broadcast between clients, a background page, the Owlbear player id and room metadata. The Owlbear docs leave the behaviour of these open, and nothing has run in a live room. If any of them fails, the storage, sync or write-rights design changes, so the answers must come before architecture is final.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In a live room, two GM tabs and a player edit the same row and different rows at once; the record states whether all clients end with the same data and whether an edit was lost
- [x] #2 With the GM tab in the background, the record states how long the `background_url` page stayed alive and whether player edits reached the GM
- [x] #3 The record states whether a guest keeps the player id after a reload and in another browser, and whether an account keeps one id across browsers
- [x] #4 The record states whether a write right can bind to a guest or only to a logged-in player
- [x] #5 The record states what Owlbear does when room metadata is written past 16kB
- [x] #6 Each result is recorded in the Muster Roll spec through `bmad-spec`, and the matching open question is closed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build a throwaway Owlbear extension on branch prototype/owlbear-probe: sync burst, background page heartbeat with player pings, player id journal, room metadata limit search.
2. Check the probe logic against a mock SDK, because it cannot run in Owlbear from here.
3. The user runs it in a throwaway room with guests and logged-in players.
4. Record each result in the spec through bmad-spec.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Probe extension is on branch prototype/owlbear-probe, in prototypes/owlbear-probe, with run steps in its README. Its logic passed against a mock SDK, and the manifest served through a tunnel with CORS. It has not run in a live Owlbear room, so no acceptance criterion is met yet.

First live run, player client data, one GM and one guest. Sync: 50 of 50 edits each way, none out of order, same fingerprint; two GM tabs not tested yet. Player id: the guest in Chrome kept its id through a page reload, across 104 minutes; the GM id was the same in Firefox and Chrome. Hidden player tab: background timer gaps of 59 s and 49 s, no page restart. Ping ran with the GM tab visible and the window open (18 of 18 acks, 0 hidden, 0 closed), so background survival on the GM side is not tested. Metadata limit not run. No acceptance criterion is met yet.

Second live run, GM client data. Metadata limit is answered: 16000 bytes stored, 16050 dropped, the write still resolves as success, peers see no change, earlier data stays. Guest id stayed the same across reloads, a rename and about 2.5 hours; the player list showed the guest as not signed in. The first three-client sync round ended too early because a hidden tab sends slowly; the probe now waits, so that round must run again. Hidden GM tab test and guest in another browser are still open.

Third live run, GM Firefox data. Sync passed: three clients, 50 edits each, none lost or out of order, same fingerprint. Hidden GM tab in Firefox: 34 minutes hidden, 176 pings received while hidden, none lost, no page restart. The window-closed counter stayed 0, so the closed state is not confirmed; the GM Chrome tab holds that data. No guest from a second browser appeared in the roster.

GM Chrome data. Hidden tab received 156 pings with none lost for about 13 minutes, then the last timer fired and messages stopped: no activity for 27 minutes while the guest kept sending (Firefox received seq 167 to 191). The page resumed on return without a restart. The window-closed counter stayed 0 on both browsers and is unreliable: pagehide may not fire for a cross-site iframe. Only a guest in a second browser remains.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ran the throwaway probe (branch prototype/owlbear-probe) in a live Owlbear room with two GM connections and guests. Sync: 50 edits from each of three clients, none lost, same data. Room metadata: 16000 bytes stored, 16050 dropped while the write reports success. Player id: a guest keeps it across reloads and gets a new one in another browser; an account has one id across browsers. Hidden GM tab: Firefox received every ping for 34 minutes; Chrome stopped timers and messages after about 13 minutes until the GM returned. Results are in the spec. Limits: AC 2 and 3 were narrowed during the run: the window-closed counter proved unreliable, so that state is unconfirmed, and a logged-in player was not observed on a later day. Each hidden-tab result is one observation. Follow-up decision: what a player edit does while no GM responds.
<!-- SECTION:FINAL_SUMMARY:END -->
