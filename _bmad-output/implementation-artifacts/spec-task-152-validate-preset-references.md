---
title: 'TASK-152: Validate repeat ids and formula references'
type: 'bugfix'
created: '2026-11-20'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/CLAUDE.md', '{project-root}/GLOSSARY.md']
baseline_commit: 'e1739fdbb45e0132f9b422bd27968ed59e171ba1'
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** A GM can save a preset whose dice formula names a field it cannot read. A repeat tab and its nested section can also share a repeat id, which leaves a stale reference after some Builder field renames.

**Approach:** Enforce both rules at the shared preset boundary. Report the same problems at their tree items in the Builder without locking the draft. Refuse a manual repeat id rename to a conflicting id.

## Boundaries & Constraints

**Always:** Given one GM and one window, use the upload and import refusal and editable Builder warning behavior of TASK-145. Follow TASK-150 for manual rename refusal. A new formula problem names the formula, the missing id, and the dice cell's place. The Builder applies its existing save and download limits for presets with problems.

**Installed presets:** The owner approved one rule set for all preset parses, including reads of installed presets. A room with an installed preset that breaks either new rule cannot read it or replace it through a normal upload. No such installed preset is known. TASK-145 keeps its existing behavior.

**Never:** Do not ban id reuse under different repeat parents, change formula syntax, change the file version, add a compatibility mode, or handle multiple GMs. Do not edit `tests/snapshot.e2e.ts` or `tests/room-copy.e2e.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input or state | Expected behavior |
| --- | --- | --- |
| Repeat id | A tab and a nested section or row share an id | Refuse the file. The Builder locates the problem on the inner repeat scope. |
| Separate branches | Two repeat scopes under different parents share an id | Accept if no other rule fails. Existing same-parent uniqueness still applies. |
| Field references | A dice formula uses a number reference or an `Nd(id)` reference absent from its block, enclosing blocks, and sheet | Refuse the file with the formula, missing id, and location. The Builder reports each missing id at the dice cell. |
| Scope resolution | A dice formula names fields in its own block, an enclosing block, or the sheet | Accept if the types and other rules pass. A field present only in another branch does not resolve. |
| Builder draft | A draft has either problem | Show the warning at the item, keep editing available, and block preset export until the problems are fixed. |
| Builder rename | A GM commits a new repeat id used by an enclosing or nested repeat scope | Keep the old id and show the refusal. A free id still commits. |
| Installed preset | A stored preset violates either new rule | The shared decoder rejects it without an exception. Normal replacement upload refuses an unreadable installed preset. |

</frozen-after-approval>

## Code Map

- `src/core/preset.ts`: `presetProblems` serves `parsePresetFile` and Builder drafts. The tree walk tracks repeat parents, and the formula pass already parses the formula tree for type checks. `resolveFieldReference` must distinguish sheet rows from repeat rows, including in non-repeat sections.
- `src/core/compose.ts`: both new upload validation and `currentPreset` use `decodePreset`. Keep this wiring unchanged so both apply the same rules.
- `src/ui/preset-errors.ts` and `src/copy.ts`: format refusal reasons in Russian. Preserve the exact tree item path for Builder warnings and include the place in the file message.
- `src/builder/document.ts` and `src/builder/item-form.tsx`: `repeatIdsAt` already supplies reserved ids for repeat creation. `IdInput` supports the `validate` callback TASK-150 uses to refuse a field rename. Check both ancestor and descendant conflicts for tabs, sections, and rows without treating other branches as related.
- `src/builder/problems.ts`, `src/builder/builder-page.tsx`, and `src/ui/preset-actions.tsx`: preserve the existing draft problem, import, upload, and export paths; they already use the shared parser or validator.
- `src/core/formula-evaluate.ts`: TASK-100 changed the comparison of full block paths. Keep that runtime comparison if removing it would make block identity less explicit, and note the follow-up in `deferred-work.md`. Port the runtime fixture to legal repeat ids so it still tests real rolls.

## Tasks & Acceptance

- [x] `src/core/preset.ts`, `src/ui/preset-errors.ts`, `src/copy.ts`: add located repeat and formula failures. Preserve syntax errors and existing formula type checks.
- [x] `src/builder/document.ts`, `src/builder/item-form.tsx`: apply repeat id rules to the manual rename, and avoid generating ids that break the rule.
- [x] `src/core/preset.test.ts`, `src/core/dice-roll.test.ts`, and applicable Builder and upload tests: replace superseded acceptance cases, protect the matrix behavior, and keep the valid runtime roll checks.
- [x] `docs/preset-format.md`, `_bmad-output/specs/spec-muster-roll/preset-format.md`, `GLOSSARY.md`, and `docs/example-preset.json`: publish both rules and keep the example representative and valid.

Given a valid preset already applied in the room, when a GM uploads either invalid preset, the upload reports the problem without replacing the room preset. Given a Builder preset import, when either rule fails, the import refuses it without replacing the draft.

## Implementation Notes

- The renderer, the replica, and Builder file import already share the strict parser. Builder draft restoration still accepts the shape first so the GM can edit a draft with problems.
- The TASK-100 full path comparison remains in the roll runtime. The fixture uses legal distinct repeat ids and still checks local and enclosing values.
- The preset change browser fixture removes two fields and now uses a new, defined but empty field to preserve the roll-time error test.

## Spec Change Log

## Review Triage Log

- Confirmed, fix: treat both new Builder problems as warnings with the same visual severity as the TASK-145 problem.
- Confirmed, fixed: CAP-7 now distinguishes a roll with an empty or non-numeric value from a preset with an invalid field reference.
- Confirmed, deferred to TASK-153: formula suggestions can contain fields from repeat rows or tabs that the dice cell cannot read. The validator correctly marks the result.
- Coverage limit: the tab and section forms prove both directions of the shared rename check. Row-specific form binding has no separate browser assertion. The parser tests cover a repeat row reusing an ancestor id.

## Verification

- `bun test src/core/preset.test.ts` and targeted Builder and roll tests: under 1 minute. The shipped presets and example still parse.
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, and `bun run build`: about 2 minutes total.
- `bun run mutants` on the committed code: about 2 minutes. `formal/drift.sh`: under 1 minute.
- `bun run test:browser --workers=1` outside the sandbox: expected 12 minutes. Run again only as needed for diagnosis or a code change.
