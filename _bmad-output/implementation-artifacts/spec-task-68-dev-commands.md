---
title: 'TASK-68: Open the builder and a live Owlbear room with separate dev commands'
type: 'feature'
created: '2026-11-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Plain `bun run dev` currently serves the Owlbear window, which cannot load outside its host. Make it serve and open the existing builder page without Owlbear or a tunnel. Add `bun run dev:owlbear` to serve the Owlbear adapter through cloudflared and print the public `<tunnel>/manifest.json` URL for Add Extension.

Keep `dev:mock`, `room`, and `preview` working until TASK-74. Keep the `.trycloudflare.com` allowed-host rule. Story 1 in `_bmad-output/specs/spec-muster-roll/stories.yaml` supplies these boundaries; this task does not change the builder itself.

</frozen-after-approval>

## Implementation Notes

- `package.json` now opens `/builder.html` for `bun run dev` and exposes `bun run dev:owlbear`.
- `scripts/dev-owlbear.ts` starts the OBR Vite adapter on strict `127.0.0.1:5173`, starts a real `cloudflared` quick tunnel, prints the tunnel manifest URL, forwards tunnel logs, and stops both child processes together.
- If `cloudflared` cannot start, the launcher terminates the Vite child before reporting the spawn error.
- Existing `dev:mock`, `room`, `preview`, and the `.trycloudflare.com` Vite host rule remain unchanged.
- Local validation passed: format, lint, types, 3165 Bun tests with one documented environment skip, 521 Chromium tests, and build.
- Real cloudflared registered a quick tunnel and printed the manifest URL. Fifteen public fetch attempts failed to resolve its hostname. Public manifest reachability and live Add Extension remain unverified; TASK-68 stays In Progress for that boundary.
- On 2026-11-15 the owner confirmed the remaining live check: "68 проверено, закройте в этом ПРе". TASK-68 is now Done on that manual evidence.

## Review Triage Log

- Deferred: the old CLAUDE.md default-dev sentence contradicts the new command description. Story 1 leaves the old block rewrite to TASK-74.
- Deferred polish: shutdown escalation for an unresponsive cloudflared child. No stalled-child occurrence was observed.
- Deferred polish: bound the parser buffer before the tunnel URL. Unbounded startup retry output was not observed.
- Rejected: pin every Vite/cloudflared flag in the CLI fakes. This would duplicate launch configuration; real command controls verify the consumed upstream boundary.
- Deferred coverage: a permanent missing-cloudflared regression test. The existing catch path has a direct failure control and no demonstrated production defect.
- Rejected: test the package.json default-dev mapping. The real opener invocation and Chromium render verify Vite's behavior without a source-shape assertion.
