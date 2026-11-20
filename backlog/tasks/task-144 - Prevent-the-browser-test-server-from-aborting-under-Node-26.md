---
id: TASK-144
title: Prevent the browser test server from aborting under Node 26
status: To Do
assignee: []
created_date: '2026-11-20T07:03:00Z'
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
- [ ] #1 The local browser check documents the supported Node version and how to run it.
- [ ] #2 A full browser run using the supported environment completes without the Vite server abort; an unsupported environment produces an actionable message or has a documented workaround.
<!-- AC:END -->
