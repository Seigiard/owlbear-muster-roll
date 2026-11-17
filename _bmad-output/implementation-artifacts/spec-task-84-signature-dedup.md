---
title: 'TASK-84: Deduplicate sheet formula signatures'
type: 'refactor'
created: '2026-11-17'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/GLOSSARY.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A plain row resolves to the sheet root block, but the formula invalidation signature serializes that same root once for every plain row. This is a source-traced scaling risk, not a measured performance incident.

**Approach:** Retain one signature entry for every relevant root or repeat block. Keep blocks from all tabs in the signature so a formula still reacts to a relevant other-tab value change.

</frozen-after-approval>

## Implementation Notes

- Navigation evidence: `/Users/seigiard/.claude/artifacts/preset-v4-78-87-20261117/exploration.report.md`, TASK-84 entry; verified against the actual source at `2147fb58047842f18d47efdfa92454ebb98834e0`.
- Scope: `src/ui/sheet/sheet-body.tsx` only. TASK-79 and TASK-82 are excluded.
