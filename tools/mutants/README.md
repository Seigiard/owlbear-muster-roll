# Mutation controls

A mutant is one small, intentional break to a rule that an existing test must detect. A killed mutant proves that its test fails when that rule is absent. A survived mutant means the selected tests did not detect the break. A stale mutant means its exact source anchor no longer identifies one location.

Run every control with:

```sh
bun run mutants
```

Run selected modules with:

```sh
bun run mutants catch-up room-copy
```

Each module JSON file is an array of controls. Add a control with a unique `id`, a one-sentence `rule`, the repository-relative target `file`, a `find` string that occurs exactly once, its `replace` string, and the narrowest `test` path array that kills it. Run the new module and confirm every control is killed before committing.

Run these controls once before merging a change to a covered module. The runner refuses to modify a target file with uncommitted changes and restores every mutation after its test, including after an interrupt.
