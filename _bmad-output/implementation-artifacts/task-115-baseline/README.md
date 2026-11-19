# TASK-115 test baseline

The junit lists of `bun test` and `bun run test:browser` on `master` at 0460c9d, taken before the first TASK-115 step. Each step of the TASK-115 epic keeps every line here: a test that is missing, renamed or no longer `pass` (or `skip`, for the one skipped test) is a regression of the step. Tests a step adds are new lines and do not count against it.

| File | Source | Count |
| --- | --- | --- |
| `bun-test.txt` | `bun test --reporter=junit --reporter-outfile=<xml>` | 3501 pass, 1 skip |
| `test-browser.txt` | `PLAYWRIGHT_JUNIT_OUTPUT_NAME=<xml> bunx playwright test --reporter=junit` | 583 pass |

Compare a run with the baseline:

```bash
bun _bmad-output/implementation-artifacts/task-115-baseline/junit-list.ts <xml> > now.txt
comm -23 _bmad-output/implementation-artifacts/task-115-baseline/bun-test.txt now.txt   # empty: nothing lost
```
