# Stack

The base is the sibling project `ttrpg-tools`, with Vite in place of Astro. No sibling project uses the Owlbear SDK.

| Area | Choice | Reason |
| --- | --- | --- |
| Runtime and packages | bun | Default in sibling projects |
| Language | TypeScript 7, strict | Current major in sibling projects |
| Lint | oxlint with type-aware rules and the anti-slop plugin | Same as sibling projects |
| Format | oxfmt | Same as sibling projects |
| Git hooks | lefthook: lint and format on pre-commit, typecheck on pre-push | Same as sibling projects |
| Build | Vite, two entry pages: popover and background | The Owlbear manifest loads each page by URL |
| UI | React 19, react-aria for form fields | Same as `ttrpg-tools` |
| State | nanostores | Same as `ttrpg-tools` |
| Styles | Tailwind 4 | Same as `ttrpg-tools` |
| Preset validation | zod 4 | Presets are hand-edited shared files; zod also emits JSON Schema for editor hints |
| Snapshot compression | fflate | Deflate was the measured format; already used in `ttrpg-tools` |
| Dice formulas | Own small parser, no library | Required by the constraint against `eval` |
| Logic tests | `bun test` with happy-dom | Same as `ttrpg-tools` |
| Interface tests | Playwright with a mock Owlbear SDK | Owlbear cannot run in CI; the mock proves app logic only |
| Hosting | Cloudflare static hosting through wrangler | Stable extension URL; v2 storage is on Cloudflare |

## Rejected

- Preact. It gives a smaller bundle, but the 16kB limit applies to data, not to code size.
- Astro and Parcel. The extension has two pages and needs neither.
