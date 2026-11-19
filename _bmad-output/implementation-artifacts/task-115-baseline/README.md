# TASK-115 test baseline

The junit lists of `bun test` and `bun run test:browser` that each TASK-115 step is compared with. First taken on `master` at 0460c9d; refreshed on `epic/task-115` at 4d6d917, after `origin/master` d3cd746 was merged in (see History). Each step of the TASK-115 epic keeps every line here: a test that is missing, renamed or no longer `pass` (or `skip`, for the one skipped test) is a regression of the step. Tests a step adds are new lines and do not count against it.

| File | Source | Count |
| --- | --- | --- |
| `bun-test.txt` | `bun test --reporter=junit --reporter-outfile=<xml>` | 3587 pass, 1 skip |
| `test-browser.txt` | `PLAYWRIGHT_JUNIT_OUTPUT_NAME=<xml> bunx playwright test --reporter=junit` | 587 pass |

Compare a run with the baseline:

```bash
bun _bmad-output/implementation-artifacts/task-115-baseline/junit-list.ts <xml> > now.txt
comm -23 _bmad-output/implementation-artifacts/task-115-baseline/bun-test.txt now.txt   # empty: nothing lost
```

## History

- 0460c9d (`master`): 3501 pass and 1 skip; 583 browser pass.
- 4d6d917 (`epic/task-115` after TASK-115.3, TASK-115.1 and the merge of `origin/master` d3cd746): TASK-115.1 added 21 tests. TASK-121 on `master` deleted `src/preview/sample-records.test.ts` (11 tests) and the browser test "the preview sample value is the first dice option". It moved `src/replica/composers.test.ts` and `src/replica/version-minter.test.ts` to `src/core/compose.test.ts` and `src/core/version-minter.test.ts`, so 7 tests carry a new file name, and it added its own tests. None of the old lines is missing for a TASK-115 reason.
- 9159272 (`epic/task-115` after TASK-115.2 and the merge of `origin/master` 8bb2369, TASK-124): no line missing; 15 tests from TASK-115.2 and 9 from TASK-124 added. 3540 pass and 1 skip; 583 browser pass.
- 1aab7b5 (`epic/task-115` after TASK-115.6): 9 tests added; 2 renamed by the TASK-115.6 lock (see deferred-work.md). 3547 pass and 1 skip; 583 browser pass.
- a6a244e (`epic/task-115` after TASK-115.4): 8 tests renamed by the TASK-115.4 lock (see deferred-work.md). 3547 pass and 1 skip; 583 browser pass.
- 224a83a (`epic/task-115` after TASK-115.7 and TASK-115.5): the union of the two ticket tips' lists. TASK-115.7 added 2 unit and 3 browser tests; TASK-115.5 moved the five schedule tests to src/platform/schedule.test.ts and added one clock scenario per runner. 3550 pass and 1 skip; 587 browser pass.
- 4c05bdc (`epic/task-115` after TASK-115.8): 36 tests added. 3586 pass and 1 skip; 587 browser pass. Lists are in C (code-point) order, as `junit-list.ts` prints them; compare with `LC_ALL=C comm`.
- 576a522 (`epic/task-115` after TASK-116): 1 rig test added. 3587 pass and 1 skip; 587 browser pass.
