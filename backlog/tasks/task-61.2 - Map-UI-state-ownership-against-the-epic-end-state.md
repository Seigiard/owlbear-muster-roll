---
id: TASK-61.2
title: Map UI state ownership against the epic end state
status: Done
assignee:
  - '@opencode'
created_date: '2026-11-13T09:44:00Z'
updated_date: '2026-11-13T10:42:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies: []
references:
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261113T102204Z-66d261b7/index.html
  - >-
    https://reports.1218217.xyz/reports/owlbear-muster-roll/20261113T104106Z-8b818dce/index.html
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
  - >-
    backlog/docs/doc-3 -
    Audit-and-experiment-UI-ownership-Storybook-and-registry.md
parent_task_id: TASK-61
type: spike
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The navigation pilot must not become the whole architecture goal. Inventory the room window, fields and repeat blocks, settings, picker, builder and shared previews against the epic. Existing pure core logic and builder document/store behavior should be reused rather than extracted again. Read the epic document first; this task establishes coverage, not a new module per file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The epic has an ownership map for each UI flow: inputs, workflow state, local interaction state, effects, current module, and external dependencies.
- [x] #2 Each flow has an evidence-backed disposition: already separated, candidate for a later slice, or explicitly unresolved; navigation is only the first slice.
- [x] #3 The map distinguishes workflow behavior from React Aria or DOM interaction behavior and identifies existing test surfaces and independent oracles.
- [x] #4 Gaps become linked tasks or explicit unanswered decisions; file size and useState count alone are not reasons for a new module.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory all UI flows using doc-1 coverage rows. 2. Audit room-window workflows and builder/picker/preview workflows independently against source, then reconcile ownership, test surfaces and oracles. 3. Mark each row as already separated, candidate migration or unresolved; link bounded work and explicit decisions. 4. Record the accepted navigation direction, complete evidence map and remaining exclusions in Backlog, then include them in the report for Claude Fable validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-13: Claude Fable 5.2 returned REVISE. All B1-B5 accepted and corrected in doc-1/doc-3 and HTML: source-grounded registry verdict, exact fixture limits, renderer/context/DOM-input coverage, deferred second-flow choice and oracle, and exact evidence wording. Original artifacts and first verdict preserved. Delta validation is pending; no production source changed and no experiment reran.

2026-11-13: Fable delta verdict ACCEPT; no blockers. Applied its three nonblocking editorial notes after acceptance. Research audit is complete; implementation and catalogue adoption remain separate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded a functional ownership audit of all 64 UI/builder/preview modules in doc-3, with workflow/widget distinctions, effects, existing test surfaces, independent oracles and separated/candidate/open dispositions. Explicit follow-up decisions cover coherent projection inputs, DOM focus facts, mount-time reveal, field editing and tree selection. Claude Fable first returned REVISE; all B1-B5 corrections received ACCEPT in the delta check. No production source changed and no full-suite or live-room result is claimed.
<!-- SECTION:FINAL_SUMMARY:END -->
