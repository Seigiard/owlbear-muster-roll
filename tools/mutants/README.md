# Mutation controls

A mutant is one small, intentional break to a rule that an existing test must detect. A killed mutant proves that its test fails when that rule is absent. A survived mutant means the selected tests did not detect the break. A stale mutant means its exact source anchor no longer identifies one location. For a stale mutant the runner prints the lines where the anchor matches, or the first anchor line that is gone from the file.

Run every control with:

```sh
bun run mutants
```

Run selected modules with:

```sh
bun run mutants catch-up room-copy
```

Each module JSON file is an array of controls. Add a control with a unique `id`, a one-sentence `rule`, the repository-relative target `file`, a `find` string that occurs exactly once, its `replace` string, and the narrowest `test` path array that kills it. Run the new module and confirm every control is killed before committing.

PR CI runs every control. Run them locally before pushing a change to a covered module. The runner refuses to modify a target file with uncommitted changes and restores every mutation after its test, including after an interrupt.

## AST mutation probe

Run the on-demand probe when you add or rewrite a module in `src/replica/`,
before planning its tests:

```sh
bun run probe
bun run probe catch-up
```

The full baseline run takes about 13 minutes with six jobs. The replica pass
takes about 50 seconds per mutation. The probe uses detached temporary
worktrees, so it does not edit the caller's checkout.

If a mutation is a new survivor, first write a test that exposes the behavior.
If it is equivalent or unreachable, add its anchor to
`tools/mutants/probe-baseline.json` with a short reason. Do not use a numeric
mutation id as a baseline anchor. Include the mutation's file, function, operation,
normalized anchor text and `nth` value.
