---
id: TASK-148
title: Check staged player edits across refusal and GM return
status: To Do
assignee: []
created_date: '2026-11-20T12:17:00Z'
labels: []
dependencies:
  - TASK-132
references:
  - formal/edit-delivery
  - .claude/skills/edit-delivery/SKILL.md
priority: low
type: task
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The two-field EditDelivery gate can stage a command after a sent version, but it keeps the GM live and does not exercise revocation or the fair resend loop. The existing refusal and liveness gates have one field, so their staged batch is empty. This leaves the interaction between staged edits, denial, and GM return unchecked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TLC explores a staged two-field entry when a refusal or revocation arrives, and checks that no edit disappears without an answer or a report.
- [ ] #2 A two-field liveness check covers a staged edit as the GM returns and verifies that the pending entry resolves under the stated fairness assumptions.
- [ ] #3 The model guide names the bounds and what remains outside them.
<!-- AC:END -->
