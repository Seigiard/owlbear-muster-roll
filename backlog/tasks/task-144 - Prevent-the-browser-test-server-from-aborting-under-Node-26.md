---
id: TASK-144
title: Prevent the browser test server from aborting under Node 26
status: Done
assignee:
  - '@claude'
created_date: '2026-11-20T07:03:00Z'
updated_date: '2026-11-20T10:20:00Z'
labels:
  - browser-verification
dependencies: []
references:
  - TASK-111
  - TASK-142
  - playwright.config.ts
  - .github/workflows/ci.yml
priority: low
type: bug
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-20, `bun run test:browser` under Node v26.13.1 on macOS passed 265 Chromium tests before the Vite server aborted. Node printed `Lazy deopt after a fast API call with return value is unsupported` from `Buffer.byteLength` in the HTTP response path serving the React Aria bundle. The remaining 322 tests failed with connection refused after the server disappeared. This is a server process crash, not an assertion timeout. CI uses Node 22 and does not run this browser suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The local browser check documents the supported Node version and how to run it.
- [x] #2 A full browser run using the supported environment completes without the Vite server abort; an unsupported environment produces an actionable message or has a documented workaround.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Name Node 26 in .tool-versions (a root mise.toml is excluded by the owner's global gitignore); the CI check job installs Node through actions/setup-node node-version-file from it; package.json engines >=26.0.0.
2. Start the Playwright Vite server as node --no-turbo-fast-api-calls (V8 abort, nodejs/node#66870, fixed on Node main by nodejs/node#67136 but in no 26.x release as of 26.13.1; NODE_OPTIONS rejects V8 flags).
3. Document the Node version and the flag in CLAUDE.md beside the browser check.
4. Run the full browser suite before and after.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Unflagged full run on Node 26.13.1: 588 passed, no abort. The abort is intermittent and has no standalone repro upstream, so one green run does not prove absence; the flag removes the TurboFan fast-call path that aborts.
Flagged full run on Node 26.13.1, nothing else running: 588 passed (3.2m), no 'Lazy deopt' and no ECONNREFUSED in the log. An earlier flagged run had 13 failures from 'Execution context was destroyed' because bun run mutants rewrote src/ files under the same checkout's Vite server; do not run mutants and test:browser at the same time.
Other checks: oxfmt, lint (warnings only), typecheck, bun test (3666, 0 fail), mutants 55/55 killed, build.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Local development and CI now use Node 26 from one file, .tool-versions: mise reads it locally and the CI check job installs Node from it instead of a hard-coded 22. package.json engines now require >=26.0.0. The Playwright Vite server starts with --no-turbo-fast-api-calls, which keeps Node 26.13.1 and earlier from aborting the server in Buffer.byteLength (nodejs/node#66870). CLAUDE.md names the Node source and the flag beside the browser check. Full browser run on Node 26.13.1 with the flag: 588 passed. Follow-up: drop the flag once a Node 26 release carries nodejs/node#67136.
<!-- SECTION:FINAL_SUMMARY:END -->
