---
id: TASK-103
title: Consider nested pending edits during preset field removal
status: To Do
assignee: []
created_date: '2026-11-18T06:48:00Z'
labels: []
dependencies: []
priority: low
type: bug
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Optional follow-up, not a preset-v4 acceptance blocker. The owner deferred concurrent preset replacement and pending player edits on 2026-11-18. Diagnostic commit 3abef2f adds keeps a nested child path when a removed sibling field is stripped and proposed again in src/replica/engine-preset.test.ts. After range is removed from the preset while attack_name and range edits are pending, the observed record retains baseline range [30,1,seed]. The complete nested key is retained; the failed assertion concerns the retained field. This synthetic scenario has no confirmed live-room impact and needs its expected proposal shape rechecked before implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If selected, establish the user-visible contract for pending nested values after a preset removes a field, and preserve the remaining edit at its complete nested path.
<!-- AC:END -->
