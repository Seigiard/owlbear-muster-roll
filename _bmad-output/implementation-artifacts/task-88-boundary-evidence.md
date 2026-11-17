# TASK-88 boundary evidence

## Verdict

The temporary refusal in TASK-77 AC2 is superseded. Format v4 supports repeat
scopes on templates, tabs, sections, and rows. A nested scope is valid under
its parent scope; its runtime block uses the complete parent-to-child path.
There is no nesting-depth limit.

This record does not claim TASK-79 AC5. The live Owlbear GM/player scenario
remains owned by TASK-86.

## Boundary matrix

| Task criterion | Proven boundary | Evidence |
| --- | --- | --- |
| TASK-88 AC1 | The public upload reader calls `parsePresetFile` before encoding data for the replica. `presetProblems` emits item paths, and Builder maps each path to its source UID and disables download when a problem exists. Invalid duplicate ids, missing `nameField`s, malformed repeat values, and invalid structure are refused at their source item. | `src/ui/preset-actions.ts:262-281`; `src/core/preset.ts:741-989`; `src/builder/problems.ts:32-70`; current parser/Builder run below. |
| TASK-88 AC2 | Repeat tabs, ordinary repeat sections and rows, and nested parent-local repeat ids remain valid. Reusing `attack` beneath different parent scopes is valid; only duplicate ids below the same parent are refused. | `docs/preset-format.md:27-29,137-169`; `src/core/preset.test.ts:382-417,950-978,1207-1226`; current parser run below. |
| TASK-88 AC3 / TASK-77 AC2 | The historical temporary repeat-tab/nested-repeat refusal is obsolete. It must not be restored or claimed as tested. The current boundary is the normal v4 structural and rule validation above. | TASK-79 ticket criteria 1-6 and calibration evidence; `final-tested-state-mapping.txt`; TASK-77 AC2 wording plus TASK-88 preparation. |
| TASK-88 AC4 | Published and canonical format documentation say that `repeat` is legal on all four container kinds, scopes may nest at any depth, and paths contain every ancestor pair. Neither document says nested scopes or repeat tabs are rejected. | `docs/preset-format.md:14-29,151-169`; `_bmad-output/specs/spec-muster-roll/preset-format.md:7-35,51-68`. These wording changes are already in accepted TASK-79 integration `29ffe1719f3e881b12dbbe2dfc7ee200902ae937`. |

## Checks-only decision

No test was added. TASK-88 changes the evidence record, not a consumer-visible
contract or source behavior. A new regression would duplicate these existing
owners:

- `src/core/preset.test.ts` owns public parsing, supported repeat tabs,
  parent-local nested ids, and item paths for rule failures.
- `src/builder/problems.test.ts` owns mapping parser problems to Builder source
  items and the blocked download.
- `src/replica/engine-preset.test.ts` owns no-write preset diff and rejected
  preset-upload behavior.
- TASK-79 owns runtime nesting, complete paths, lexical lookup, duplication,
  import, and browser rendering. Its calibrated tests are recorded in
  `/Users/seigiard/.claude/artifacts/preset-v4-window4-20261117/task-79/nested-tdd-20261117-202031/test-writer-3.report.md`.

No actual unsupported repeat shape or unowned occurrence was reproduced. TASK-80
owns Builder controls and its additional tests; this record does not modify
those files.

## Current-run evidence

Both commands ran from
`/Users/seigiard/.herdr/worktrees/owlbear-muster-roll/task88-boundary-w4-20261117`
at `29ffe1719f3e881b12dbbe2dfc7ee200902ae937`. The worktree had uncommitted
TASK-88 Markdown only (`dirty=1`); no source or test file was changed.

| Command | Exit | Raw output |
| --- | ---: | --- |
| `bun test src/core/preset.test.ts src/builder/problems.test.ts --test-name-pattern 'same nested repeat id\|repeat tab with its explicit name field\|lists every problem\|marks each invalid state'` | 0; 4 pass, 0 fail | `/Users/seigiard/.cache/herdr-run/task88-parser-builder.log`; durable state: `task88-parser-builder.meta`, `.exit` |
| `bun test src/replica/engine-preset.test.ts --test-name-pattern 'answers with the count of stored values the preset erases, and writes nothing\|is refused when the stored preset does not decode'` | 0; 2 pass, 0 fail | `/Users/seigiard/.cache/herdr-run/task88-upload-boundary.log`; durable state: `task88-upload-boundary.meta`, `.exit` |

Accepted TASK-79 browser evidence is tied to clean candidate
`301dfcfb65028d815f6c9205ce31b4356a152f66`: focused nested owner `1 passed`
and full Playwright `573 passed`; see
`/Users/seigiard/.claude/artifacts/preset-v4-window4-20261117/task-79/nested-tdd-20261117-202031/final-tested-state-mapping.txt`.

## Documentation checks

| Command | Exit | Raw output |
| --- | ---: | --- |
| `bunx oxfmt --ignore-path .gitignore --no-error-on-unmatched-pattern --check "_bmad-output/implementation-artifacts/spec-task-88-supported-repeat-boundary.md" "_bmad-output/implementation-artifacts/task-88-boundary-evidence.md"` | 0; Markdown is excluded, so the formatter found no matching files | `/Users/seigiard/.cache/herdr-run/task88-doc-format.log`; durable state: `task88-doc-format.meta`, `.exit` |
| `git diff --check` | 0; no output | `/Users/seigiard/.cache/herdr-run/task88-diff-check.log`; durable state: `task88-diff-check.meta`, `.exit` |
