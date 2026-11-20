---
title: 'TASK-134: Let the React Compiler transform the Builder StructureTree'
type: 'refactor'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** React Compiler 1.0 skips `StructureTree` (`src/builder/structure-tree.tsx`) with "Expected Identifier, got CallExpression key in ObjectExpression": `getItems` builds each drag item as `{ [dragTypeOf(current, String(key))]: String(key) }`. The component gets no automatic memoization.

**Approach:** Compute the drag type into a local before the object literal, so the computed key is an identifier. Drag items keep the same types and values. The compiler probe must print nothing for the file.

</frozen-after-approval>

## Implementation Notes

- `getItems` maps each key through a block: `id = String(key)`, `type = dragTypeOf(current, id)`, then `{ [type]: id }`. Same type and value per key as before.
- Probe (`bun ./zz-probe.ts src/builder/structure-tree.tsx`) prints nothing after the change.
- `tests/builder.e2e.ts`: 31/31 pass. Calibrated: with the drag type changed to `${type}-x`, both drag tests (`:1227` row out of a repeat section, `:1274` section into a new tab) fail, because `getDropOperation` reads the kind from the drag type.

## Review Triage Log

- Blind Hunter (OpenCode, gpt-6.2-sol): nothing in the repository checks that the compiler compiles `StructureTree`; the build and the drag tests stay green if a later edit brings the bailout back — `low`, verified: the probe is a scratch tool and the build does not report bailouts. Deferred: the guard applies to every component, and the orchestration keeps the probe out of git.
