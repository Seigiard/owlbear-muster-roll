# TASK-65.4: Tailwind class linting under oxlint

## Scope

Add `eslint-plugin-better-tailwindcss` to the oxlint pipeline for the Tailwind
CSS entry point at `src/ui/main.css`. Keep correctness rules as errors and the
selected style rules as warnings. Extend the plugin selectors so named
`*_CLASS` constants are checked in addition to the default `className`, `clsx`,
and `cva` selectors.

Enable oxfmt Tailwind class sorting and format the final tree once. Keep
existing tests and expectations unchanged. Do not add permanent tests for
upstream plugin semantics or configuration inventories.

## Code map

- `package.json`, `bun.lock`: pinned `eslint-plugin-better-tailwindcss@4.11.0`.
- `.oxlintrc.json`: plugin registration, `src/ui/main.css` entry point,
  `*_CLASS` variable selector, and the eight selected rules.
- `.oxfmtrc.json`: `sortTailwindcss` uses `src/ui/main.css` and sorts strings
  passed to `clsx` and `cva`.
- `src/builder/**`, `src/preview/**`, and `src/ui/**`: one-time oxfmt Tailwind
  class sorting.
- `src/ui/sheet/duplicate-count.tsx`: remove the unavailable width utility after
  the project theme reset made `w-20` unknown. The original `w-20` generated no
  CSS, so removing it preserves the input's intrinsic browser width; adding
  `w-[5rem]` would have changed the rendered width.
- `src/ui/sheet/preset-section.tsx`: resolve the existing `full` width key
  before `clsx`, so the key is not mistaken for a class string. Rendered
  classes and section width behavior stay unchanged.

## Implementation

The configured rules are:

- errors: `no-unknown-classes`, `no-conflicting-classes`,
  `no-concatenated-classes`;
- warnings: `no-duplicate-classes`, `no-unnecessary-whitespace`,
  `no-deprecated-classes`, `enforce-canonical-classes`, and
  `enforce-consistent-variant-order`.

The plugin's upstream defaults recognize `className`, `clsx`, and `cva`.
`settings["better-tailwindcss"].selectors.extends` adds the
`^.*_CLASS$` variable matcher without replacing those defaults.

The configuration follows the upstream TSX/Oxlint parser guide and advanced
selector documentation:

- <https://github.com/schoero/eslint-plugin-better-tailwindcss/blob/main/docs/parsers/tsx.md>
- <https://github.com/schoero/eslint-plugin-better-tailwindcss/blob/main/docs/configuration/advanced.md>
- <https://github.com/schoero/eslint-plugin-better-tailwindcss/blob/main/docs/api/defaults.md>

The formatter's supported function boundary is `clsx` and `cva`; its schema has
no variable-name matcher for static `*_CLASS` constants. Those constants remain
lint-validated, but oxfmt does not sort their strings. They are not wrapped in
runtime calls only to obtain formatter sorting.

## Validation

- `controls/unknown-class-constant.log`: a temporary `*_CLASS` fixture with
  valid `bg-fill` and `touch-target` neighbors plus `bg-fill-strng`; real
  `bun run lint` exits 1 with only the configured
  `better-tailwindcss/no-unknown-classes` diagnostic. The fixture is restored.
- `controls/no-concatenated-residuals.log`: real configured probes for
  partial-token interpolation and `+`, direct ternary, `&&`, `.join()`,
  literal, identifier, `clsx`, and `cva`. The partial-token interpolation and
  `+` forms exit 1 under `no-concatenated-classes`; ternary, `&&`, and
  `.join()` exit 0, as do the allowed literal, identifier, `clsx`, and `cva`
  forms. Exact TASK-65 old forms `${BASE_CLASS} bg-fill` and
  `BASE_CLASS + ' bg-fill'` also exit 0 (the latter emits only the selected
  whitespace warning). The fixture is restored. TASK-65.2 must cover the
  whole-class interpolation and `+` forms plus direct ternary, `&&`, and
  `.join()`.
- `controls/formatter-theme-functions-control-retry.log`: real formatter
  control. With `sortTailwindcss: true`, the JSX attribute sorted but `clsx`
  and `cva` strings did not. With the configured `src/ui/main.css` stylesheet
  and `functions: ["clsx", "cva"]`, the custom `touch-target` token and both
  function strings were sorted. The first external-path attempt is preserved in
  `controls/formatter-theme-functions-control.log` with its ignore-rule
  diagnostic; the retry used an in-repository temporary probe and
  `--ignore-path /dev/null`.
- `controls/65-1-format.log`: one-time formatter run after the correction.
- `controls/final-format.log`: final `bunx oxfmt --ignore-path .gitignore
  --check .` evidence (exit 0, 0.21s).
- `controls/final-lint.log`: final full lint evidence and runtime (exit 0,
  185 warnings, 0 errors, 3.27s).
- `controls/final-typecheck.log`, `controls/final-test.log`,
  `controls/final-browser.log`, `controls/final-browser-rerun.log`, and
  `controls/final-build.log`: final project checks, each with command, state,
  scenario, exit status, and output. Typecheck passed in 0.60s; unit tests
  passed with 3009 passes, 1 skip, and 0 failures in 52.05s. The first
  browser run had one isolated selection focus failure at
  `tests/selection.e2e.ts:150` after 519 passes. The unchanged rerun passed
  520 tests in 2.9m, so the failure was not reproduced and no expectations
  changed. The production build passed in 337ms after transforming 1674
  modules; the existing `advancedChunks` deprecation warning remains.

Original implementation commit: `9a92c21403c69eeaa47dc8df199ee86e6f344c22`.

## Limits

Warnings already present in the repository, including canonical-class
suggestions and unrelated oxlint warnings, remain warnings. No permanent test
or project-specific source-inventory assertion is added. The browser check
uses the existing Playwright mock-adapter suite and stops its web server when
the run ends.

## Review correction

Review round 1 found two reachable minor defects. The correction is committed
in `74ec9c3859dfbd677b912d58fb0f15bc08faf311`:

- `.oxfmtrc.json` now points `sortTailwindcss` at `src/ui/main.css` and names
  `clsx` and `cva` as sortable functions. A real formatter control proves that
  project tokens and both function strings are reached. The upstream schema has
  no variable matcher, so static `*_CLASS` constants remain lint-validated but
  are not wrapped in runtime calls for formatting.
- `src/ui/sheet/duplicate-count.tsx` no longer has a width utility. The real
  built CSS and browser control measured the no-width form and the original
  `w-20` form at the same `193px`; the project theme emits no `w-20` rule.

The source correction re-ran the owner test, format, lint, typecheck, unit,
browser, and build checks. The first standalone width-control attempt failed
because the Playwright-managed browser executable was absent; the retry used
the installed Google Chrome binary and passed. The locked owner test file
remains byte-identical to `lock_sha`. Current evidence is in
`/Users/seigiard/.claude/artifacts/tdd-20261114-220152/controls/`:
`65-1-owner-test.log`, `65-1-final-format.log`, `65-1-final-lint.log`,
`65-1-final-typecheck.log`, `65-1-final-unit.log`, `65-1-browser-first.log`,
`65-1-build.log`, `65-1-width-control-managed-browser.log`, and
`65-1-width-control-retry.log`.
