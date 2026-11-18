# Platform boundary

The local window and background use the mock adapter through the same platform
ports as the Owlbear adapter. Shared contract tests exercise those local ports.

## Sub-features

- `platform-launch`: render window and background without the Owlbear SDK.
- `platform-storage`: exercise the shared storage contract in Chromium.
- `platform-broadcast`: exercise shared broadcast recipient and ordering cases.
- `platform-metadata`: exercise the metadata behavior covered by contract fixtures.

## How to get to it (user POV)

Open the extension in a room. For local verification, the runner substitutes
the mock adapter and starts the window and background from the tests.
The live port-contract page is a separate opt-in owner workflow.

## Driving it with Playwright

Run `bun run verify platform`. Read `tests/smoke.e2e.ts` for launch and
`tests/port-contract-storage.e2e.ts` for the shared contract fixtures.
Observe the scenario results and retained traces, not only a successful
HTTP response from Vite.

For a separately requested live check, follow the project instructions for
`bun run port-contract:live` in an empty test room. Its observations require
manual comparison and are not an automatic pass/fail verdict.

## Gotchas

- A normal browser tab is not an Owlbear host.
- Shared mock contracts do not prove host quota, capacity or silent-drop behavior.
- Listener and relay failures need independent evidence before blaming the host.
