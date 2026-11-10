---
id: TASK-2
title: Measure remaining Owlbear platform facts for the architecture
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-10T10:47:00Z'
updated_date: '2026-11-10T10:47:00Z'
labels:
  - spike
dependencies: []
priority: high
type: spike
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Muster Roll architecture spine (_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md) relies on platform facts that the Owlbear docs do not state and that TASK-1 did not measure. A wrong assumption here breaks message trust between GM tabs (AD-5), window to background traffic (AD-10) or pacing (AD-12) after code is written. Probe code stays on branch prototype/owlbear-probe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A second GM tab of one account is confirmed present or absent in the other tab's party list, with its role
- [ ] #2 The broadcast rate limit is characterised: the rate at which sends are refused, how long recovery takes, and whether it is per client or shared, or the highest rate tried is recorded with no limit found
- [ ] #3 The result of a broadcast over 16KB is recorded, with whether size counts bytes or characters for Cyrillic text
- [ ] #4 A LOCAL round trip between a window and the background page is recorded, with whether the sender gets an echo, whether 16KB applies and whether LOCAL hits the rate limit
- [ ] #5 Whether a read right after setMetadata shows a dropped write is recorded, with the delay needed
- [ ] #6 The events a page receives after a Chrome freeze are recorded in order, or the run records that no freeze occurred
- [ ] #7 localStorage in the extension iframe in Safari is confirmed to survive a reload or not
- [ ] #8 Results are written to storage-and-sync.md and the spine is updated where a result changes a rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the probe on branch prototype/owlbear-probe with an automatic run for party list, metadata read-back, oversized messages and bursts, plus a LOCAL test from the window and a persistent page event log. 2. Check it against the mock. 3. Serve it on the running tunnel. 4. Owner runs it in a live room. 5. Record results in the spec and spine.
<!-- SECTION:PLAN:END -->
