# TASK-65.2: Reject hand-assembled `className` values

## Scope

Add the project-specific Oxlint rule
`muster-roll/no-hand-assembled-classname`. It checks only a direct JSX
`className` expression. It rejects all five forms that assemble a class string
at the attribute boundary:

- a template literal with one or more substitutions, such as
  `` `${BASE_CLASS} bg-fill` ``;
- binary `+`, such as `BASE_CLASS + " bg-fill"`;
- a direct ternary;
- a direct logical `&&` expression;
- a direct `.join()` call.

The rule does not inspect expressions inside a `clsx` or `cva` call. Static
string literals, static template literals, identifiers, and `clsx`/`cva` calls
remain valid. Other JSX attributes are unchanged. Variant-map indexing is
outside this task and remains part of TASK-65.3.

## Code map

- `tools/oxlint/muster-roll/rules/no-hand-assembled-classname.ts`: rule
  visitor and direct-expression classification.
- `tools/oxlint/muster-roll/index.ts`: project plugin entry using
  `eslintCompatPlugin`.
- `.oxlintrc.json`: plugin registration and error-level rule configuration.
- `tsconfig.json`: narrow static coverage for the project plugin and its locked
  real-CLI test without including vendored anti-slop.
- `tools/oxlint/muster-roll/no-hand-assembled-classname.test.ts`: locked
  public-boundary fixtures; this implementation does not modify the file.

## API

The plugin uses `defineRule` and `eslintCompatPlugin` from `@oxlint/plugins`,
the same API as the vendored anti-slop rules. Oxlint loads the entry through
`.oxlintrc.json`:

```json
{
  "name": "muster-roll",
  "specifier": "./tools/oxlint/muster-roll/index.ts"
}
```

The configured rule is:

```json
"muster-roll/no-hand-assembled-classname": "error"
```

## Evidence

TASK-65.4 control
`/Users/seigiard/.claude/artifacts/tdd-20261114-220152/65.4/controls/no-concatenated-residuals.log`
shows that `better-tailwindcss/no-concatenated-classes` rejects partial-token
construction but leaves whole-class interpolation and `+` construction. The
same control shows that direct ternary, `&&`, and `.join()` forms are
upstream residuals. The local rule therefore closes all five direct gaps while
leaving Tailwind-specific validity and partial-token diagnostics to the
upstream plugin.
