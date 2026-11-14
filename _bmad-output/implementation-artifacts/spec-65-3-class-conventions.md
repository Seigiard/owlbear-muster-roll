# TASK-65.3: Record the `clsx` and `cva` convention

## Scope

Document the UI class assembly convention in `CLAUDE.md`, beside the existing
interface-text guidance. Agents changing UI components should:

- build conditional `className` values with `clsx`;
- define named control variants with `cva`;
- follow `muster-roll/no-hand-assembled-classname`, the project rule that
  enforces the `className` assembly boundary.

This is agent-facing guidance. It does not change application code, lint
configuration, tests, or `GLOSSARY.md`.

## Validation

- Direct inspection confirms the new block targets agents writing or changing
  UI components, is imperative, and stays concise.
- The block names `clsx`, `cva`, and the actual project rule without listing
  the rule's AST cases or duplicating its configuration.
- TASK-65.2's accepted report and controls provide the rule evidence:
  `muster-roll/no-hand-assembled-classname` is enabled as an error and its
  10/10 owner test plus full lint pass.
- TASK-65.1 and TASK-65.4 reports provide the accepted implementation and
  full-check evidence reused for the parent epic. Their covered source,
  dependency, generated, and test paths remain unchanged in this slice.

## Limits

No new permanent test is added. Agent-facing prose has no independent
behavioral oracle. The optional source audit is temporary and is saved under
the TASK-65.3 run controls.
