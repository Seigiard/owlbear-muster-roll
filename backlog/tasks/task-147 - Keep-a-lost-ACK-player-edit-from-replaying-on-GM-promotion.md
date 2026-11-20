---
id: TASK-147
title: Keep a lost-ACK player edit from replaying on GM promotion
status: To Do
assignee: []
created_date: '2026-11-20T12:17:00Z'
labels: []
dependencies:
  - TASK-132
references:
  - src/replica/pending-edits.ts
  - src/replica/engine.ts
priority: low
type: bug
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A player can be promoted while its proposal still waits for an ACK that was lost after the GM committed the edit. `pendingEdits.drain` passes that original command to the promoted engine, which can mint it as a new GM edit over a later correction. This path predates TASK-132 and does not require a later edit of another field.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After promotion, a proposal that had already committed cannot overwrite a later GM update of its field.
- [ ] #2 A pending edit that had not committed is preserved on promotion or the player receives an explicit refusal.
- [ ] #3 An engine test exercises promotion after a lost ACK and a later GM edit.
<!-- AC:END -->
