---
id: TASK-87
title: Remove retired v3 assumptions from v4 internals and comments
status: In Progress
assignee:
  - '@openai'
created_date: '2026-11-16T22:52:00Z'
updated_date: '2026-11-17T10:18:00Z'
labels:
  - format-v4
  - active
dependencies: []
references:
  - src/core/link-target.ts
  - src/core/preset-migrate.ts
  - src/core/repeat-block-duplicate.ts
  - src/ui/main.tsx
  - 'TASK-77 review: arch+quality-claude-6/7/12'
  - lean-codex-2
  - docs+tests-claude-6
  - arch+quality-claude-11
priority: low
type: chore
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The single TASK-77 review found v3-only paths still present after stable repeat ids and token cells replaced the old model. liveLinkTarget constructs a block index that it never reads; preset-migrate retains an unreachable relocation pass; first-field and linkable comments describe retired behavior. Duplicate unused exports and the literal picker popover id add avoidable maintenance traps. These are source-traced cleanup findings, not measured performance incidents, and are outside the remaining feature acceptance work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Link resolution and preset reconciliation no longer construct unused indexes or execute unreachable relocation preparation; surviving values, order and clear markers stay unchanged.
- [ ] #2 Touched comments describe explicit repeat.nameField and token-cell targets, with no retired first-field or tokens/linkable guarantee.
- [ ] #3 Unused duplicate preset helpers are removed and the token-cell picker opener shares the existing popover id constant.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the TASK-87 review occurrences and all callers against feature frontier e799aaed9c3c76044752b06d776d4e98a2f878e8.
2. Use the TDD checks-only route: a delegated writer removes only verified-unreachable v3 preparation, unused helpers and stale comments; no new tests.
3. Run existing behavioral owners and the six stable source checks, then append objective evidence without finalizing acceptance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
CURRENT: Queued after the remaining source work. No cleanup was implemented in this pass yet; behavior-preserving removal and comment updates remain open.

CURRENT: Starting the isolated behavior-preserving v3 cleanup after TASK-84. Blocked TASK-79/80/81/82 candidates are excluded. No source result is claimed yet; the next step is the small cleanup and stable validation.

CURRENT: Investigation is complete at 04fea980fd9d2341c79dc4632008cfadd8c2a79c. The committed spec is `_bmad-output/implementation-artifacts/spec-task-87-retired-v3-cleanup.md`; it confirms the read block-index parameter, stable-id relocation preparation, obsolete preset exports, naming fallbacks/comments, and literal token-cell picker id. TASK-79/80/81/82 candidates remain excluded. Next phase: delegated checks-only cleanup, then stable validation.

CURRENT: Source cleanup committed as 31dc8450411e0ef60cbf3b5c71d2f3822bcdc109. Existing behavior owners passed 300/300; the stable six-check launcher passed at the same commit (format, lint, typecheck, Bun, browser 558, build). Durable evidence: `/Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/task-87/final-checks/checks.json` and `owners.log`. No task acceptance was checked; parent-owned closing review remains.
<!-- SECTION:NOTES:END -->
