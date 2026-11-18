---
id: TASK-115.3
title: 'Step 1: better-result replaces core/result across the project'
status: To Do
assignee: []
created_date: '2026-11-18T19:41:00Z'
labels:
  - architecture
dependencies:
  - TASK-114.3
documentation:
  - >-
    _bmad-output/planning-artifacts/architecture/effect-sync-core-2026-11-18/DESIGN.md
parent_task_id: TASK-115
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/core/result.ts` is 9 lines imported by 48 files (20 core, 17 replica, 5 platform, 3 ui, 2 builder) with 314 `.ok` checks and no tagged errors or exhaustive match. ADR-0004 part 3 chooses `better-result` 3.0.1 (3.4 KB gzip, zero dependencies, compiles on TypeScript 7.0.2) as the one `Result` in the repository. Its shape differs (`status`, `.value`, `.error`, `Result.ok`, `Result.err`), so this is one mechanical PR with no behavior change. Owner decision Q13: after TASK-114.3 is merged, so after all three block-address PRs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `src/core/result.ts` is deleted and no file imports it; `better-result` is pinned in `package.json`
- [ ] #2 `bun test` and `bun run test:browser` junit lists equal the baseline
- [ ] #3 The background page grows by at most 4 KB gzip in `bun run build`
<!-- AC:END -->
