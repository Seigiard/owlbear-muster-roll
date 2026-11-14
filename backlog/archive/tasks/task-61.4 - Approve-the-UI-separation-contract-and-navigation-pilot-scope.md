---
id: TASK-61.4
title: Approve the UI separation contract and navigation pilot scope
status: To Do
assignee: []
created_date: '2026-11-13T09:44:00Z'
updated_date: '2026-11-14T05:51:00Z'
labels:
  - architecture
  - ui-decoupling
dependencies:
  - TASK-61.1
  - TASK-61.2
  - TASK-61.3
references:
  - docs/adr/0002-navigation-uses-pure-transitions-with-react-rendering.md
documentation:
  - >-
    backlog/docs/doc-1 -
    Epic-framework-independent-UI-behavior-and-simple-rendering.md
parent_task_id: TASK-61
type: docs
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A small number of entry points does not by itself make a deep module. The owner needs a clear choice after the navigation and visual-isolation research, without committing to a global registry, shared emitter or machine library by default. This is the approval gate before a production-code pilot.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The owner has reviewed the end-state map, alternative navigation module shapes and catalogue experiment results in a zero-context comparison.
- [ ] #2 The chosen interface ownership, external effects, event delivery, lifecycle and test surface are explicit; unresolved choices stay named.
- [ ] #3 The pilot scope preserves current room behavior and names what evidence can support later UI slices.
- [ ] #4 The approved decision is recorded in the project architecture documents or an ADR when warranted, with rejected alternatives and load-bearing reasons.
- [ ] #5 The epic records approval separately from preliminary agent recommendations and links the next task; no implementation is implied by this research task.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-13 owner decision: pure transitions inside a separate navigation module; React remains rendering. Accepted in ADR-0002. This settles the architectural direction, not the precise interface, full ownership audit, catalogue results, or production pilot approval. Next requested sequence: full UI audit plus isolated Storybook/registry experiment, HTML report, then Claude Fable validation.

2026-11-13 Fable correction: the gate must explicitly decide how DOM focus facts (main.tsx:420,491) enter pure transitions and how sheet-body.tsx:72-101 consumes reveal after mount. Shared renderer contexts are implicit inputs to audit, not a reason for a new registry. Picker remains a preliminary second-flow candidate selected only after the navigation pilot; its label sequence oracle is spec-4-7-offer-the-sheet-name-as-the-token-label.md, not UX-DR22 alone.

2026-11-13: owner chose an interactive single-HTML navigation state-machine prototype instead of deciding the contract through a long interview. It is a throwaway design tool: pure transitions, a thin DOM shell, manual projection/outcome delivery, guided edge cases and visible state/effects. Current behavior and proposed rules must be labeled separately. No production interface or behavior change is approved until the owner validates the walkthroughs.

Later owner direction supersedes the prototype gate in the preceding note: preserve existing UX, implement the actual navigation state machine, check completeness/noncontradiction and connect it to the real window. The owner explicitly said to start and finish the work. No manual reapproval of old navigation rules or Storybook adoption is required for TASK-61.5. Keep unresolved wider research/fit decisions separate from the approved production pilot.

2026-11-14: archived. The owner approved the navigation pilot directly, as the notes above record; the implemented contract is in ADR 0002 and the TASK-61.5 spec. The remaining research questions stay with TASK-61.3 and TASK-61.6.
<!-- SECTION:NOTES:END -->
