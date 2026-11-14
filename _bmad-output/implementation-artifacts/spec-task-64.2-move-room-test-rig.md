---
title: 'TASK-64.2: move the room test rig out of production source'
type: 'refactor'
created: '2026-11-14'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The shared room test rig is test infrastructure stored under `src/replica`, where it requires a lint exemption and makes the production replica layer appear to depend on UI modules.

**Approach:** Move the rig verbatim to `tests/support/room-rig.ts`, update every test importer and the tests documentation, and remove the dedicated lint exemption without changing test behavior or helper capabilities.

</frozen-after-approval>

## Implementation Notes

- Moved `src/replica/room-rig.ts` verbatim to `tests/support/room-rig.ts`, removing only the obsolete TASK-64.2 exemption comment.
- Updated all rig consumers to use the existing relative test-support convention, removed the dedicated Oxlint override, and documented the new path in `CLAUDE.md`.
- Baseline and final `bun test` runs each covered 3010 tests across 109 files and 633 engine cases. The first final run exposed one intermittent link-picker failure; its isolated 23-test rerun and the subsequent full retry passed on unchanged state. The root cause was not proven.
- Final format, lint, typecheck, browser and build checks passed. Detailed command output and exit statuses are in `/Users/seigiard/.claude/artifacts/tdd-20261114-213052/64.2/controls`.

## Review Triage Log

- Review-01 findings 1–4 — **fixed**: the exact controls directory, observed-failure wording with an unproven cause, external/internal/relative import grouping, and Bun-only/browser test-support documentation are now recorded.
- Review-01 finding 5 — **rejected**: the suggested spec-to-ticket link was not a format or acceptance requirement, and no failed run or ambiguity was evidenced.
- Final review `01-final.json` — profile `final`, 2/2 healthy sources, zero findings, and zero open questions. No new deferred items were added.
