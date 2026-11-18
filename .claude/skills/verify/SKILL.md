---
name: verify
description: Verify Muster Roll's browser behavior with quick, feature, or full Playwright runs. Use after app changes, to audit UI coverage, or to capture reproducible browser evidence.
---

# Verify Muster Roll

Read [the feature map](features/README.md). Choose the smallest profile that
covers the change. Use `full` before claiming that all automated browser
scenarios pass. A quick run does not prove the other profiles.

## Launch

Run from the repository root:

```sh
bun install --frozen-lockfile
bun run verify list
bun run verify quick
```

If Chromium is absent, run `bunx playwright install chromium` and retry.
The runner starts the existing Vite mock server and Chromium. It creates fresh
browser contexts, so no account, database, seed service or personal browser
profile is needed. Individual tests establish the preconditions they need.

The window is `/index.html` with `/background.html` in the same context.
The standalone builder is `/builder.html`. Tests drive the real React app,
domain code and replica through the existing mock platform boundary.

The server port depends on the checkout path and uses `--strictPort`.
Run one verification process per checkout. Use another worktree for parallel
runs; verify that worktree's exact Git revision before starting.

## Doctor

When launch or a test looks wrong, run these read-only checks:

```sh
git rev-parse HEAD
bun run verify list
bunx playwright test --config playwright.verify.config.ts --list
```

Compare the revision and selected profile with the run metadata. Discovery
must find tests rather than merely return a successful command. Inspect the
run's browser errors, JSON report and trace before retrying a failure.
For a busy port, identify its owner with `lsof`; leave other runs alone.

## Drive

```sh
bun run verify quick
bun run verify sheets
bun run verify builder
bun run verify players
bun run verify rolls
bun run verify tokens
bun run verify data
bun run verify platform
bun run verify full
```

`quick` selects the contract-backed `@verify-quick` journeys. Feature profiles
select existing spec files. `full` discovers every browser spec without a
filename filter. `list` shows the actual profile selection and unmapped files.
Use the matching feature page to interpret a result and extend its scenarios.
Profiles group spec files, not every dependency of a feature. For changes to
preset layout, field types or options, run `quick` plus `data` and the affected
`sheets` or `rolls` profile. In particular, dice-choice editing is in `rolls`,
and the populated section-move journey is in `sheets`.

Drive behavior through visible controls, native file choosers and downloads.
Existing storage fixtures can establish preconditions. A storage setter or
posted internal command is not evidence that the user's action works.
Use exact roles, accessible names and stable data handles, not coordinates.

## Evidence

Each run prints its evidence directory under `test-results/verify/`.
Keep that directory. It contains run metadata, a Playwright JSON report and
browser artifacts, including traces and failure screenshots.
The runner also saves the tracked working-tree diff, nonignored untracked
files and process ownership details. Use these with the recorded revision
when a run starts from an uncommitted tree.

Report the selected profile, passed, failed, skipped and flaky counts, command
exit status, and evidence directory. A failure, an empty selection, a skipped
test or a flaky result does not establish complete success. State the missing
coverage separately from the failures observed during this run.

For persisted values, close and reopen both room pages and read the UI again.
For file round trips, import the actual downloaded bytes. Expected values come
from the contract and user input, not from the app's encoder or the downloaded
file itself. Capture the action and resulting state, not only a final screen.

Mock evidence does not prove Owlbear host delivery, real token menus, popover
lifecycle, host quotas or external dice interoperability. The feature map also
records known untested paths. A full green run means all discovered automated
browser tests pass, not that every possible interaction is covered.

## Cleanup

Playwright owns its server and isolated browser contexts and closes them when
the run ends. Await that terminal result, including after interruption.
Keep evidence when a run fails. Before retrying, confirm that the old runner
and its server have stopped.

If a process remains, inspect its recorded ownership and terminate only a
process created by this run. Compare `process.json`'s launcher and Playwright
PIDs with their current commands and checkout, then inspect their descendants
and the listening port. A reused PID is not proof of ownership.
Never kill a process by name or remove another
run's evidence. Browser downloads needed as proof must be saved outside the
browser context's temporary download directory.

## Helpers

The checked-in launcher is `scripts/verify.ts`, invoked through
`bun run verify <profile>`. `playwright.verify.config.ts` supplies evidence
settings without changing the normal test configuration.

Use `/maintain-verification-skill` when app behavior or test coverage changes.
