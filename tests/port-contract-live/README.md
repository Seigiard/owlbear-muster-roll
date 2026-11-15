# Live port contract harness

`bun run port-contract:live` starts Vite in OBR mode. It does not join a room
or write room data by itself.

## Install the dev harness

Use an owner-selected empty test room. Do not use the production manifest or
the production origin.

1. Start the server:

   ```sh
   bun run port-contract:live
   ```

2. In a second terminal, expose the local server through HTTPS:

   ```sh
   cloudflared tunnel --url http://127.0.0.1:5173
   ```

3. Copy the HTTPS hostname printed by `cloudflared`.
4. In Owlbear's extension manager, install this dev manifest URL:
   `https://<tunnel-host>/tests/port-contract-live/manifest.json`.
5. Install the same manifest in both Owlbear clients.
6. Open the same empty test room in both clients.

The manifest loads `port-contract-live-background.html` as its background and
opens `port-contract-live.html` as its action popover. A normal browser tab is
not an Owlbear host and is not live evidence.

## Choose the two roles

1. Open the dev extension action in the first client.
2. Keep the generated run id in the role picker and choose
   **Запустить как координатор**.
3. Open the same dev extension action in the second client.
4. Paste the exact run id into the role picker and choose
   **Запустить как второй клиент**.
5. Wait until the coordinator reports that the second client joined. It checks
   the room id and rejects a peer from another room.

The run id scopes every broadcast channel, storage key, metadata key and
control request. A direct diagnostic URL also accepts
`?run=<id>&role=coordinator` or `?run=<id>&role=peer`, but the role picker is
the owner procedure inside Owlbear.

## Expected observations

Run the scenarios from the coordinator:

- **Storage:** an absent key reads as `null`; overwrite reads the latest string;
  remove restores `null`; the owned key list contains only the generated keys.
- **LOCAL:** the coordinator receives its own message and the hidden local
  bridge popover receives the message in a separate same-client extension
  context. The bridge forwards that observed event to the coordinator.
- **REMOTE:** the peer receives the message with the coordinator connection id;
  the coordinator does not receive its own REMOTE message.
- **One-sender order:** the peer receives `first`, `second`, `third` in that
  order.
- **Metadata:** the final read and observed final snapshot keep the retained
  entry, add the new entry, and omit the entry set to `undefined`.

The harness returns observations for manual comparison. It does not compare
them with the expected results and it does not produce an automatic PASS/FAIL
verdict. Compare the observation JSON with the list above before treating the
run as useful evidence.

The shared scenarios use finite observation windows. The harness waits up to
2 seconds (`observationTimeoutMs`) for an expected delivery. After the
expected number of events is observed, it waits 100 ms (`quietPeriodMs`) for
an immediate extra event. These bounds limit this observation run; they are
not guarantees about Owlbear delivery latency, absence, or ordering.

Inspect the browser console for all participating contexts: the coordinator,
the paired peer, and the hidden local bridge iframe/popover. A control relay
can fail while the adapter event is present, or an adapter event can be
missing while the relay is working. A control transport error or a missing
observation is therefore ambiguous. Never use a missing observation alone to
claim an Owlbear host defect.

Use this operator sequence:

1. Wait until the coordinator reports that the peer joined before pressing
   **Запустить поддерживаемые сценарии**.
2. Run one set of scenarios at a time. Do not start cleanup while a run is
   active, and keep both owner contexts open until observations are compared.
3. Clean up from the coordinator, then press local cleanup in the peer. Close
   both extension actions only after cleanup and console inspection.
4. If a lifecycle or control error occurs, recreate both paired extension
   actions and repeat the procedure in an empty test room. Do not reuse a
   partially paired run as evidence.

The coordinator's cleanup removes only its run-id storage and metadata keys.
Press local cleanup in the peer too, then close both extension actions. The
coordinator can show a status error for an operation it is awaiting: peer
joining, a scenario call or its own cleanup. That is a harness coordination
failure, not an adapter-semantic verdict.

The hidden local bridge is a real second extension context opened through the
coordinator's popover port. It is not a same-page subscription. Event-forwarding
failures in the peer or hidden bridge are logged only in that context's iframe
console; the coordinator may simply lack the corresponding observation. Inspect
the coordinator, peer and bridge consoles before interpreting a missing or
incomplete observation. Do not use it alone to claim an Owlbear host defect.

The harness does not prove injected storage failures, real rate-limit quota or
recovery, metadata capacity or silent drops, cross-client timing guarantees,
or global multi-sender order. No live-room action is part of automated checks.
These limits and the operator sequence are procedure and evidence boundaries,
not new runtime guarantees.
