---
id: TASK-95
title: Open the correct player block tab after preceding GM-only tabs
status: In Progress
assignee:
  - '@seigiard'
created_date: '2026-11-17T11:05:00Z'
updated_date: '2026-11-17T14:40:00Z'
labels:
  - format-v4
  - review-follow-up
  - major
  - release-blocker
dependencies: []
references:
  - TASK-78
  - src/ui/main.tsx
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261117T105007Z-401dcadf/review.html#adversarial-claude-3
priority: high
type: bug
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to TASK-78. Token opening mixes the full tab-list position with the player's filtered tab-list position, selecting the wrong visible tab or sibling block.

Evidence: confirmed code review of snapshot 7dcd100a74fe6d795259a2d63a337dfcb855c188. Existing green suites do not cover the defect; no new runtime reproduction or source repair is claimed.

Review finding: adversarial-claude-3

> `repeatBlockTabIndex` (link-target.ts) now returns a position in `renderedTabs(...)`, which is not filtered by role. `cellTab` is converted into the role-filtered `visible` list, but `blockTab` is not. `openRequestTransition` stores `blockTab ?? cellTab` (blockTab wins), and `openTemplateTab` reads the value as an index into `visibleTemplateTabs`. For a GM the two lists match. For a player they diverge whenever a `visibility: "gm"` tab comes before the target.

> Example: tabs [Secrets (gm), Stats, Gear with a repeat section]. A player opens a token linked to a Gear block. blockTab=2, but the visible list has length 2, so the window falls back to Stats and the reveal finds nothing. With a GM-only tab before a repeat tab, block A's full index 1 selects block B in the visible list. The request is then acknowledged as handled. Before this change, both indexes were source indexes checked with `tabShownTo`, so this is a regression for repeat-section links as well. The new e2e test in tests/repeat-tabs.e2e.ts:372 covers only a GM, and the existing hidden-tab test places the hidden tab after the visible one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With tabs Secrets (GM-only), Stats and Gear containing a repeat section, a player opening a Gear token selects and reveals Gear rather than falling back to Stats.
- [ ] #2 A player opening repeat-tab block A after a preceding GM-only tab selects A, not B.
- [ ] #3 Hidden targets remain unavailable to players and GM token opening remains correct.
- [ ] #4 Browser regression coverage verifies the selected target and reveal through the public token-open flow for repeat sections and repeat tabs.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify TASK-91 rendered-tab identity conversion in the public token-open consumer and capture the baseline path.
2. Lock browser regressions for a player opening a repeat section and repeat-tab block after a preceding GM-only tab.
3. Preserve the existing implementation if the new lock proves it; otherwise repair only role-filtered token opening in main.tsx/navigation.
4. Calibrate each target-selection assertion against the prior positional-index behavior and run required checks; request the shared full-browser slot only after the other checks are green.
<!-- SECTION:PLAN:END -->
