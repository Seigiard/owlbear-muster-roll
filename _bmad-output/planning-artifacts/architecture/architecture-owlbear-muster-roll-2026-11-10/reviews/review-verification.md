# Verification review: Muster Roll architecture spine

Checked on 2026-11-10 against `ARCHITECTURE-SPINE.md` (draft, 2026-11-10). The spine was not edited.

## Verdict

**Pass with required changes.** All 16 Stack versions are exact and current. All SDK surfaces that the spine names exist. One platform constraint is missing: Owlbear enforces a broadcast rate limit, and AD-4, AD-7, AD-10 and AD-12 do not account for it. Fix F1 and F2 before AD-7 and AD-12 are final.

## Evidence used

| Source | Trust | Used for |
| --- | --- | --- |
| `npm view <pkg> version`, `gh api repos/oven-sh/bun/releases/latest` | Primary, run today | Versions |
| SDK 3.1.0 `.d.ts` and `.js` in `prototypes/owlbear-probe/node_modules`, and `owlbear-rodeo/sdk` source | Primary | API surface |
| A typecheck of each relied-on call with TypeScript 7.0.2, in the session scratchpad | Primary | API surface compiles |
| Branch `prototype/owlbear-probe` and `storage-and-sync.md` | Primary, live room | Measured behavior |
| `owlbear-rodeo/{dice,weather,dynamic-fog,ranges,initiative-tracker}` | Primary, official examples | Manifest and context menu patterns |
| `ZJHSteven/owlbear-doc` (`docs/markdown/...`, last pushed 2025-11-22) | Secondary: a third-party copy of the docs, about one year old | Doc wording |
| Public extensions, named at each finding | Secondary: other authors' code and comments | Rate limit and LOCAL in practice |
| Cloudflare docs, `workers/static-assets/headers/` | Primary | Default response headers |

**Access note.** `docs.owlbear.rodeo` was not read. One `WebFetch` and one `curl` with a browser User-Agent both returned 403, and no content came back. The `curl` probe should not have used a browser User-Agent, because the task had already said that the site refuses automated fetches. A `markdown.new` proxy and a Wayback copy were not used, because they would route around that refusal. All doc wording below comes from the GitHub copy, plus one web-search summary that agrees with it. Compare it with the live docs before relying on exact words.

## Findings

### F1. High. A broadcast rate limit exists, and the spine does not account for it

**Fact.** Owlbear rejects broadcasts with the error `RateLimitHit` and the message "Too many requests". The doc copy does not mention this. The evidence is code that handles the error in public extensions:

- `FullPeople/obr-suite` `extensions/three-dragon-ante/src/game/broadcast.ts`: "Owlbear rejects broadcasts with `RateLimitHit: Too many requests`, and it counts messages, not bytes." It spaces sends by 150 ms and backs off up to 6 s. Its `index.ts` says that Owlbear "refuses the whole client once the broadcast rate is exceeded".
- `FullPeople/obr-suite` `docs/SDK-RATE-RECOVERY289.md`: a production incident, with `RateLimitHit` confirmed in a browser log.
- `LPfontes/Lancer-Owlbear-Extension` `src/services/obrBridge.ts`: retries, with 80 ms between sends. `Snikerss/dnd-sheet-owlbear-extension` `utils/storage.ts`: 80 ms between chunks.
- `nachoijp/Rising-Ranges`, `Sewef/FlankYou`: also handle it. `kamejosh/owlbear-hp-tracker` handles the same error on `scene.items` calls, so the limiter is not specific to broadcast.

The rejected value is a plain object in the form `{ error: { name: "RateLimitHit" } }`, not an `Error`.

**What is measured.** The probe sent about 20 small messages per second per client for 2.5 seconds, with no loss. The probe never sent a sustained burst or a large message. The threshold is unknown.

**Effect on the spine.**

- AD-7: each GM client answers each `state-request` with its full replica. At session start or on a reload wave, the answers multiply. Estimate: 8 clients, each request answered with 4 to 10 chunks, gives 32 to 80 messages from each GM client in a few seconds. This is above any rate that was measured.
- AD-7 has a correctness gap. "The state ends at the first `last`". If the limiter refuses an earlier chunk and `last` is delivered, the client leaves `catching-up` with a partial replica. It can then validate proposals against stale ACL records, which is what AD-7 exists to prevent.
- AD-12: the split function has no pacing and no retry.
- AD-4: "resends until it receives" has no interval or backoff. Resends during an outage add to the limit.
- AD-10: LOCAL messages appear to share the limit (three-dragon-ante, one source).

**Required change.** Add a rule that all sends pass through one serial queue with spacing, and that `RateLimitHit` is waited out. Add `chunk i of n` to `state`, so an incomplete answer is detected. Spread or coalesce `state` answers. Add a probe of a large-message burst to learn the real threshold.

### F2. High. AD-10 relies on LOCAL for a path that nobody has run here, and the path is underspecified

**Confirmed.** LOCAL reaches other iframes of the same extension in the same client. The SDK has the value. The doc copy says: "LOCAL will send to the current player". `FullPeople/obr-suite` `src/state.ts` uses LOCAL for "cross-iframe sync". `kamejosh/owlbear-hp-tracker` `src/background/api.ts` receives requests in the background page and replies over LOCAL. Three Dragon Ante sends views from a controller to a panel over LOCAL.

**Not confirmed here.** The probe never used LOCAL. It sent `destination: "REMOTE"` only, and it linked the window and the background page with `localStorage` and `storage` events. So AD-10 is not backed by a measurement in this project.

**Gaps.**

- AD-10 defines commands from windows, but not how the projection reaches a window. AD-11 says that players do not persist, so a player window has no storage path.
- If the projection goes over LOCAL, the 16KB limit very likely applies. The doc copy states the limit on `data`, with no exception for a destination, and Three Dragon Ante splits its LOCAL traffic into parts. AD-12 limits only "room traffic" on the `sync` channel.
- Whether the sender receives its own LOCAL message is unknown. Handlers must tolerate an echo.

**Required change.** State the projection path. Put the UI channel under the AD-12 size rule and the F1 queue. Add one LOCAL round trip to a probe.

### F3. Medium. `party.getPlayers()` excludes the current client

The types do not say this. The doc copy says "Get the other players currently in the room". `GaelZiade/owlbear-mythras` (`CLAUDE.md`) and `rdren0/Ploozle` (`src/lib/useOwlbear.ts`) confirm it. AD-5 maps every sender through this list and drops a miss. That is correct for REMOTE traffic on `sync`, where a client never receives its own messages. It is wrong for any message from the client itself. AD-5 must name its scope: the `sync` channel only, not `app.muster-roll/ui`. The spine must also state that `sync` uses `REMOTE`, and that a client reads its own role from `OBR.player.getRole()`.

### F4. Medium. AD-8 reads back with no stated wait, but the measurement waited 1.5 seconds

The probe read metadata after `PEER_WAIT_MS` = 1500 ms. The result "16050 bytes dropped" is therefore known only after that delay. An immediate read could return an optimistic local value and report a false success. AD-8 must wait before the read, or confirm through a new measurement that an immediate read is reliable. The wait can stay in the Deferred table, but the rule needs to say that it exists.

### F5. Medium. Production hosting needs CORS, and the seed has no provision for it

The probe needed `cors: true` because "Owlbear fetches the manifest and pages cross-origin". `owlbear-rodeo/ranges` sets CORS for `https://www.owlbear.rodeo`. Cloudflare static assets send no `Access-Control-Allow-Origin` by default, per the Cloudflare docs. Add `public/_headers` to the Structural Seed.

### F6. Low. Packages missing from Stack

These are needed by the stated choices but have no pinned version. Latest versions were read today where shown.

| Package | Needed for | Latest |
| --- | --- | --- |
| `react-dom` | React, and a peer of react-aria-components | 19.3.1 |
| `@types/react` | TypeScript | 19.3.0 |
| `@vitejs/plugin-react` | React under Vite | 6.3.0 |
| `@tailwindcss/vite` | Tailwind under Vite | 4.3.5 |
| `@nanostores/react` | nanostores in React | not read |
| `oxlint-tsgolint` | type-aware rules in `stack.md` | 7.0.2006 |
| `@happy-dom/global-registrator` | happy-dom under `bun test` | 21.0.4 |
| `nanoid` | AD-2 ids | not read |

Peer ranges fit: `@vitejs/plugin-react` needs vite ^8, `@tailwindcss/vite` allows ^8, `react-aria-components` allows React 19, and `oxlint` wants `oxlint-tsgolint` >=7.0.2005. `wrangler` and `vite` declare Node engines (>=22.12 and ^20.19 or >=22.12), so a machine with only bun may not be enough. Node 26.13.0 is on this machine.

### F7. Low. The SDK types need `skipLibCheck: true` under TypeScript 7

With `skipLibCheck: false`, `tsc` 7.0.2 reports TS7016 in the SDK's `MessageBus.d.ts`, because `events` has no types. With `skipLibCheck: true` the check passes with no errors. The probe used `true`. Keep this setting, or add `@types/events`.

### F8. Low. Ports in the spine do not cover all SDK use

AD-16 confines the SDK to `src/platform/obr`, and the Layer table names ports for broadcast, metadata, party and storage. CAP-13 and CAP-14 also need `contextMenu`, `popover` or `modal`, `player`, and `scene.items`, for a token existence check on import.

### F9. Low. Noticed in passing, outside the fact check

AD-6 sets `gmLink` to online only on a recent GM-origin message. AD-12 has no heartbeat type. A quiet session with no edits would show "no connection to GM". A GM client with no other GM also receives no GM-origin message.

## Confirmed

### Stack: all exact, and all are the latest release

| Name | Spine | Registry today |
| --- | --- | --- |
| bun | 1.4.4 | 1.4.4 (npm and GitHub release, 2026-10-22) |
| TypeScript | 7.0.2 | 7.0.2 |
| @owlbear-rodeo/sdk | 3.1.0 | 3.1.0 |
| React | 19.3.1 | 19.3.1 |
| react-aria-components | 1.22.1 | 1.22.1 |
| nanostores | 1.5.5 | 1.5.5 |
| Tailwind CSS | 4.3.5 | 4.3.5 |
| zod | 4.6.7 | 4.6.7 |
| fflate | 0.8.3 | 0.8.3 |
| Vite | 8.3.7 | 8.3.7 |
| oxlint | 1.93.0 | 1.93.0 |
| oxfmt | 0.78.0 | 0.78.0 |
| lefthook | 2.2.2 | 2.2.2 |
| happy-dom | 21.0.4 | 21.0.4 |
| @playwright/test | 1.65.0 | 1.65.0 |
| wrangler | 4.159.0 | 4.159.0 |

### SDK surface

| Claim | Result | Evidence |
| --- | --- | --- |
| Destinations `REMOTE`, `LOCAL`, `ALL` | Exists | `BroadcastApi.d.ts`. Default is REMOTE per the doc copy |
| `event.connectionId` | Exists | `onMessage` callback type. Used in the probe's SDK types and in other extensions |
| `party.getPlayers()` with `id`, `connectionId`, `role` | Exists | `Player.d.ts`. Role is `"GM" \| "PLAYER"`. See F3 |
| Mapping sender through the party list | Pattern in use | `ArmindoFlores/embers` `MessageProvider.tsx` |
| `room.id` | Exists | Synchronous getter, parsed from the `obrref` URL parameter |
| Room metadata get, set, change | Exists | `RoomApi.d.ts`. `setMetadata` is a partial update per key (doc copy, and probe) |
| Metadata limit | Documented and measured | "must be under 16kB" (doc copy). 16000 stored, 16050 dropped (live room). AD-8's 15500 has a margin of 500 bytes |
| Silent drop past the limit | Measured | `storage-and-sync.md` |
| `background_url` page | Exists | Manifest key in the doc copy and in official `dice`, `weather`, `dynamic-fog`, `ranges`. Ran in the probe |
| Context menu to open from a token | Exists | `OBR.contextMenu.create`. `onClick` gives `context.items[].id`. Filter has `roles` and `every`. Official extensions register it from the background page |
| Opening a window | Exists | `OBR.popover.open`, `OBR.modal.open`, `OBR.action.open` |
| Broadcast size limit 16KB | Documented | "Limited to 16KB in size" (doc copy). AD-12's 15000 leaves a 1000-byte margin |
| Hidden-tab behavior, player id stability, peer sync | Measured | `storage-and-sync.md`. Hidden-tab results are one observation per browser |

All named technologies exist and fit their roles. SDK 3.1.0 was published on 2024-12-03 and is still the latest.

## Could not confirm, or could be out of date

| Item | Why it matters | How to settle it |
| --- | --- | --- |
| The rate limit's threshold, window and scope (per client, per extension or per room) | Sets the F1 pacing. One author suspects that extensions in a room compete for it | Burst probe in a live room |
| Whether LOCAL counts toward the limit | AD-10 traffic | Same probe. One third-party source says that it does |
| Whether a sender receives its own LOCAL message | Handler design | One LOCAL probe |
| Behavior of a broadcast over 16KB: rejection or silent drop | AD-12 relies on the margin. Metadata is dropped silently | Send 15000, 16000, 16500 bytes |
| How 16KB is measured: JSON bytes, UTF-16 units or a wire format | Cyrillic text and the 1000-byte margin | Same probe with non-ASCII data |
| Whether a second tab of one account appears in the other tab's party list with role GM | AD-1 and AD-5 drop `commit` from a tab that is missing. The probe took its role from `hello` messages, not the party list | Log `getPlayers()` in two GM tabs |
| Immediate read-back after `setMetadata` | F4 | Read at 0 ms and at 1500 ms |
| `visibilitychange` firing after Chrome froze the page | AD-7 and AD-8 triggers. The probe saw the page resume, but did not record the event | Log the event in a hidden-tab run |
| `localStorage` persistence in a third-party iframe in Safari | AD-11. Tested in Chrome and Firefox only | Test in Safari, or state that it is not supported |
| Current wording of the Owlbear docs | The copy is about one year old | A person opens the docs in a browser |
| Host-side limits in general | The SDK has not changed since 2024-12, but the Owlbear host can change limits without an SDK release | Re-run the probe before release |
