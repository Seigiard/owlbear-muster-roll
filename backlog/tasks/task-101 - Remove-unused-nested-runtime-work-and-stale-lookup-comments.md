---
id: TASK-101
title: Remove unused nested-runtime work and stale lookup comments
status: To Do
assignee: []
created_date: '2026-11-17T23:10:00Z'
labels:
  - format-v4
  - review-follow-up
dependencies: []
references:
  - TASK-79
  - src/core/link-target.ts
  - src/core/preset-migrate.ts
  - src/core/formula-evaluate.ts
  - _bmad-output/implementation-artifacts/task-79-window4-review.md
priority: low
type: chore
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Window-4 review of 62044f2 found maintenance work outside the TASK-79 behavior repair: liveLinkTarget builds a default block index and discards it; sectionTarget ignores parameters; presetDiff retains unreachable relocation state because stable ids never relocate; formula lookup comments omit enclosing blocks and blockAt. Findings arch+quality-claude-6, lean-codex-3 and docs+tests-codex-4. Reassess after the blocking full-path fixes, which may change these mechanisms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Token-link validation performs no unused whole-room index construction while retaining its current visible-target checks.
- [ ] #2 Migration contains only reachable behavior required by the stable repeat-id contract; unused parameters and state are removed or justified by a live consumer.
- [ ] #3 Formula lookup comments describe own block, enclosing blocks and sheet in their actual order, including the parent-value source.
- [ ] #4 Existing affected behavior checks pass without adding source-shape or absence tests for this cleanup.
<!-- AC:END -->
