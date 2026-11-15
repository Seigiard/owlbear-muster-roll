---
title: 'TASK-64.8: take dev-only preview code out of the shipped builder page'
type: 'refactor'
created: '2026-11-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '33804c44065fc760f652d4fb2bb5a5248bc8708d'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/GLOSSARY.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-owlbear-muster-roll-2026-11-10/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The shipped builder imports two small helpers from `src/preview`, although the project map defines `src/preview` as dev-only. The UI layer also lacks the lint boundary that protects it from replica, builder and preview imports.

**Approach:** Move the theme definitions and stub rolling helper verbatim into `src/ui`, update every importer, add the exact `src/ui/**` restriction, and reconcile AD-20 with the resulting builder graph. Preserve existing behavior and all SDK and adapter restrictions.

</frozen-after-approval>

## Implementation Notes

- Planning found no user-visible intent gap or irreversible operation. The chosen move-to-shared-UI path is the parent-approved option from the ticket.
- The source change is limited to the two verbatim helper relocations, importer rewiring, `.oxlintrc.json`, AD-20, and this workflow spec.
- Temporary lint probes will cover each forbidden UI edge, allowed core/UI/platform-port imports, builder preview import rejection, and retained SDK/direct-adapter restrictions. Existing unit, browser, build, format and type checks will provide regression evidence; a built-output browser smoke check will exercise theme selection and dice settlement.
- `src/preview/themes.ts` and `src/preview/stub-rolling.ts` moved verbatim to `src/ui/themes.ts` and `src/ui/stub-rolling.ts`; builder and standalone preview importers now use the shared UI paths. No UI importer currently targets `@/replica`, `@/builder` or `@/preview`.
- `.oxlintrc.json` adds the `src/ui/**` restriction while retaining SDK and direct-adapter controls. The negative probes exited 1 with `no-restricted-imports`; allowed core/UI/ports and SDK-from-OBR probes exited 0. Probe output and cleanup evidence are under `TASK-64.8/controls/lint-*`.
- Final checks on the dirty state based on `33804c44065fc760f652d4fb2bb5a5248bc8708d`: format, lint, typecheck, unit (`3029 pass, 1 skip, 0 fail`), browser (`521 passed`) and build all exited 0. Built-output smoke observed `DARK -> LIGHT`, a settled dice cell with no message, and zero browser errors; its server cleanup left port 4173 free.
- Review-01 R1 is fixed: before the builder restriction, a temporary `src/builder` probe importing `@/preview/sample-records` passed real `bun run lint` (exit 0); after adding `@/preview` and `@/preview/**` to the builder override, the same probe failed with `no-restricted-imports` (exit 1), while allowed builder UI imports remained accepted. The controls are `TASK-64.8/controls/builder-preview-before.verdict`, `builder-preview-before.output`, `builder-preview-after.verdict`, `builder-preview-after.output` and `builder-ui-allowed-after.output`.
- Review-01 R2 and R3 are fixed: the two active `DESIGN.md` themes references now point to `src/ui/themes.ts`, and AD-20 names `src/copy.ts` separately. Historical memlogs and specs retain their original change narratives.
- Review-01 deferred two unverified polish findings: alias-only layer rules do not cover relative-path bypasses, and the smoke's visible post-click result does not prove callback invocation. Neither is claimed as a runtime bug. Both are recorded in `deferred-work.md`.
- Smoke limit: the built-output check verified the visible `DARK -> LIGHT` result, a settled dice cell with no rolling/error message, and zero browser errors; it did not prove that the roll callback was invoked.
- Batch 2 final checks after all documentation updates: `bunx oxfmt --ignore-path .gitignore --check .` exited 0 (`TASK-64.8/controls/format-batch2-final.verdict` and `.output`), and `bun run lint` exited 0 with existing warnings only (`TASK-64.8/controls/lint-batch2-final.verdict` and `.output`).
- Final review (`final` profile) completed healthy: 2/2 reviewers reported with no findings, open questions or blocking issues.

## Review Triage Log

- R1-R3 fixed: the builder preview alias restriction covers `@/preview` and `@/preview/**`; active `DESIGN.md` theme references point to `src/ui/themes.ts`; AD-20 names `src/copy.ts` outside `src/ui`.
- Deferred polish: alias-only rules do not block relative-path bypasses; the built smoke does not prove callback invocation.
- Rejected: the portability suggestion to publish local control logs, because the task requires recorded local evidence.
- Final review: focused → final, 2/2 healthy, with no blocking findings.
