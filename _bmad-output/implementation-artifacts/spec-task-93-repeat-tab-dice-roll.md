# TASK-93: Roll dice from repeat-tab blocks

## Intent

A dice cell in a repeat-tab block must resolve its formula from that selected block. The room roll path and Builder Preview use the same core dice preparation.

## Scope

- Recognize a tab repeat scope when a dice place has an instance id.
- Resolve the selected tab block's field values for formula lookup.
- Preserve root, repeat-section, and repeat-row behavior.

## Acceptance Evidence

- A selected repeat-tab block with `hp=7` rolls `1d1 + hp` as `8` in the room.
- Builder Preview proves selected-block resolution through exact field-error and successful empty-feedback states. Core and Room independently assert the literal result 8; Preview does not display that number.
- Fixtures keep distinct root and sibling `hp` values so a wrong scope cannot pass.
- Core and dedicated repeat-tab browser tests establish the reported pre-repair `not-dice` failure and the repaired behavior.

## Boundaries

- Do not change `main.tsx`, `sheet-body.tsx`, or `tests/repeat-tabs.e2e.ts`.
- Do not use Preview editing as test setup; TASK-96 owns that path.
- Do not change dice feedback invalidation; TASK-98 owns that behavior.

## Completion

- Implemented and reviewed in window 2. The review also repaired numeric, dice-choice and label lookups across plain sections of one repeat tab.
- Final source `077bb748d66e4ea8b5324399ce52b67cdbb5f37b` passes all six checks: 3413 unit pass, 1 skip; 570 browser pass.
- The cross-section exact-result regression fails when the old numeric lookup is restored. The closing `final` review reported no gating findings.
