---
title: 'TASK-67: Run the replica mutation probe on demand'
type: 'feature'
created: '2026-11-15'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '370b62b2fb6c7ab8b7c05d3305eb0761e76f30c9'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/mutation-probe-2026-11-15.md'
  - '{project-root}/_bmad-output/implementation-artifacts/task-66-verification.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The hand-written controls in `tools/mutants/*.json` share their author's blind spots. The AST mutation generator that found 82 untested behaviors and one defect lives only in a document appendix and needs TypeScript 5 installed by hand.

**Approach:** Make the generator a committed, on-demand two-pass probe (`bun run probe [module...]`) that parses with the project's own TypeScript 7 API, mutates only disposable detached checkouts, and compares survivors with a committed baseline matched by anchor, so the report shows only what is new or gone.

## Boundaries & Constraints

**Always:**
- Parse with `typescript/unstable/async` and `typescript/unstable/ast` from the pinned `typescript@7.0.2`; add no parser dependency.
- Keep the generator's operator set and pass structure: pass 1 runs the module's own `src/replica/<name>.test.ts` (30 s limit); pass 2 runs `src/replica/` for pass-1 survivors (180 s limit); `bun test --bail`. A module without its own unit test goes straight to pass 2.
- Mutate only detached `git worktree` checkouts of `HEAD` under the OS temp directory, run in parallel (`--jobs`, default 6). Remove them, and `git worktree prune`, on success, failure, SIGINT and SIGTERM.
- Refuse to start when a selected module or its unit test has uncommitted changes, as `run.ts` does.
- Report timeouts apart from kills and survivors.
- Exit 0 only when the run has no new survivor, no new timeout and no missing baseline entry.

**Never:**
- No CI step, no change to `bun run mutants` or the JSON controls.
- No numeric ids in the baseline.
- Do not probe or baseline the Epic 64 modules (`command-routing`, `generation-flow`, `roll-flow`, `room-protocol`, `engine`); a follow-up task does that. The command must still accept them as arguments.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unchanged code | `bun run probe` on this branch | Counts per module; 0 new, 0 missing; exit 0 | N/A |
| New survivor | A mutation survives both passes and has no baseline anchor | Listed with file, line, function, operation, original and mutated text; exit 1 | N/A |
| Gone anchor | A baseline entry matches no generated mutation | Listed as missing; exit 1 | N/A |
| Repeated text | Two mutations share file, function, operation and node text | Told apart by `nth`, their order in the source | N/A |
| Unknown module | `bun run probe nope` | Error naming the available `src/replica/*.ts` modules | Exit 1, no checkout created |
| Dirty module | Selected module has uncommitted edits | Refusal naming the file | Exit 1, no checkout created |
| Interrupt | Ctrl-C mid-run | Checkouts removed; partial counts printed | Exit 130 |

</frozen-after-approval>

## Code Map

- `/private/tmp/claude-501/-Users-seigiard-Projects-owlbear-muster-roll/1dbfd4b9-7631-40b9-8a8d-718c762ecdbc/scratchpad/probe/probe.ts` -- working TS5 generator; same source as the appendix of `mutation-probe-2026-11-15.md`. Port `generate`, `swaps` and `fnName`; drop its in-place file writes and hardcoded module map.
- `.../scratchpad/probe/rerun/unit.jsonl`, `replica.jsonl` -- reference run on `53f742d`: 788 rows (`id,file,line,fn,op,before,after,result`), 65 survivors after pass 2, 3 unit timeouts (`room-copy#83,#85,#86`). Seed the baseline from these. The three modules and their tests are byte-identical on this branch.
- `_bmad-output/implementation-artifacts/task-66-verification.md` -- "Catch-up/Room-copy/Publisher survivors" tables: verdict and reason per id. Copy each into its baseline entry; timeouts get verdict `timeout` and the note under the tables.
- `tools/mutants/run.ts` -- reuse its idioms: `repositoryRoot`, `hasUncommittedChanges`, signal handling, zod for JSON. Do not change its behavior.
- `node_modules/typescript/dist/api/async/api.d.ts` -- `new API({ cwd })`, `updateSnapshot({ openProjects: [tsconfig] })`, `snapshot.getProjects()[0].program.getSourceFile(path)`, `api.close()`. Proven under Bun: nodes carry `kind`, `pos`, `end`, `parent`, `getStart()`, `getText()`, `forEachChild`. The sync API fails under Bun.
- `node_modules/typescript/dist/ast/is.generated.d.ts`, `index.d.ts` -- `SyntaxKind` and `is*` guards (numbers differ from TS5; never hardcode them).
- `tsconfig.json` -- `include` lacks `tools/mutants`.
- `package.json` -- `scripts`.

## Tasks & Acceptance

**Execution:**
- [ ] `tools/mutants/probe/generate.ts` -- port the generator to the TS7 API; return mutations with file, line, function path, operation, start/end, replacement, normalized node text and `nth` -- one pure, testable inventory
- [ ] `tools/mutants/probe/baseline.ts` -- zod schema, anchor key, and `compare(rows, baseline)` returning new survivors, new timeouts and missing entries -- pure logic for unit tests
- [ ] `tools/mutants/probe/run.ts` -- CLI: module selection, dirty check, checkout pool, two passes, report, exit code, cleanup
- [ ] `tools/mutants/probe-baseline.json` -- 65 survivors plus 3 timeouts with verdict and reason
- [ ] `tools/mutants/probe/*.test.ts` -- unit tests for generation on a small fixture source and for `compare` (match, new, missing, `nth` ties)
- [ ] `package.json` -- add `"probe": "bun tools/mutants/probe/run.ts"`
- [ ] `tsconfig.json` -- include `tools/mutants`; fix any type errors this exposes in existing files
- [ ] `tools/mutants/README.md` -- when to run (a new or rewritten `src/replica` module, before planning its tests), cost (about 13 min for the three baselined modules at 6 jobs; pass 2 costs about 50 s per mutation), and how to classify a new survivor (gap → write a test; equivalent/unreachable → add a baseline entry with a reason)

**Acceptance Criteria:**
- Given this branch, when the generator runs on the three baselined modules, then it yields 788 mutations whose `(file, line, op, before)` multiset equals the reference `unit.jsonl`.
- Given the baseline, then every anchor key is unique and every entry has a verdict in `equivalent | unreachable | timeout` and a non-empty reason.
- Given a probe run, then the caller's working tree and `git worktree list` are the same before and after.

## Design Notes

Anchor = `file` + `fn` + `op` + whitespace-collapsed full text of the mutated node + `nth`. The reference shows why: `file+fn+op+token` collides in 95 groups and adding the source line still leaves 47 (for example two `&&` on one `if` line). `nth` is the 1-based index among mutations with the same other fields, in source order, so it stays stable when unrelated code moves.

## Verification

**Commands:**
- `bun test tools/mutants` -- expected: pass
- Project full check (`bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bun run build`) -- expected: pass
- `bun run probe` -- expected: 0 new survivors, 0 new timeouts, 0 missing entries, exit 0, about 13 min; worktree list unchanged afterwards

## Implementation Notes

## Spec Change Log

## Review Triage Log
