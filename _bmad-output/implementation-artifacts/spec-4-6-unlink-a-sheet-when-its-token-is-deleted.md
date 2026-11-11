---
title: '4.6 Unlink a Sheet When Its Token Is Deleted'
type: 'bugfix'
created: '2026-11-11'
status: 'done'
baseline_commit: '3030ecafbeb913a79ee16c5ba841ee7bd3ff1c62'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-link-a-token-to-a-sheet.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the live-room release check the GM deleted a linked token, and its sheet still showed "Токен привязан". Story 4.4 read only `link:` records and never the scene, so a deleted token stays linked forever and its link cannot be removed, because no token is left to click. Backlog task: TASK-39, whose four acceptance criteria apply in full.

**Approach:** Add a scene port. A GM background watches the current scene's items. When a token id that was in the item list disappears from it while the same scene stays ready, and a live `link:` record names that token, the background tombstones the record through the normal GM `link-clear` path. A scene that is not ready, a scene change, or a token never seen in this scene never removes a link.

## Boundaries & Constraints

**Always:** Only GM clients write. The tombstone goes through the existing `link-clear` composer, persistence, send and room-copy path, so other clients and the room copy drop it. Removal is detected only between two item lists of one ready period of the scene (Owlbear reports `isReady` false while a scene changes). A `link-clear` that finds nothing to clear is silent. The scene port lives in `platform/ports.ts` with an OBR adapter (`OBR.scene.isReady`, `OBR.scene.onReadyChange`, `OBR.scene.items.getItems`, `OBR.scene.items.onChange`) and a mock that tests can drive.

**Never:** Reading the scene in the window or on player clients. Removing a link because a token is out of view, on another scene, or not yet loaded. Writing token metadata.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deleted | Linked token removed from the current ready scene | `link:` tombstoned; "Токен привязан" gone on every GM client; menu filters updated | N/A |
| Two GMs | Both see the removal | Both send `link-clear`; one record; no message | N/A |
| Scene change | Scene goes not-ready, another scene loads | No link removed | N/A |
| Other scene | Link to a token never seen in the current scene | Kept | N/A |
| Not loaded | Scene not ready at start | Nothing removed until a ready list is seen; removals counted only after that | N/A |
| Player | Player client sees the removal | Does nothing | N/A |
| Catch-up | GM in `catching-up` when the removal happens | The removal is remembered and cleared after catch-up (if the link is still live) | N/A |
| Undo | Owlbear undo brings the token back | Link stays removed; the GM links again (accepted) | N/A |
| Import | Snapshot import | Unchanged: links to absent tokens stay inert (TASK-31) | N/A |
| Several | Several linked tokens deleted at once | All their links tombstoned, one batch or several commands | N/A |

</frozen-after-approval>

## Code Map

- `src/platform/ports.ts`, `src/platform/obr/index.ts`, `src/platform/mock/*` -- new scene port.
- `src/replica/token-menu.ts`, `src/replica/engine.ts`, `src/replica/composers.ts` -- link records, `link-clear`, GM-only background logic.
- `src/core/token-links.ts` -- live links lookup.

## Tasks & Acceptance

**Execution:**
- [x] Scene port + OBR adapter + mock (with test hooks to add and remove items and toggle readiness).
- [x] A pure function in `core` or `replica` that, given the previous and next item id sets of one ready period and the live links, returns token ids to unlink.
- [x] GM background wiring: subscribe, track the ready period, send `link-clear` for removed linked tokens; remember removals during catch-up.
- [x] Tests: unit for the removal function (every matrix row that is data); engine for GM-only, catch-up, two GMs, silent no-op; e2e in the mock: link, delete the token, "Токен привязан" gone; scene change keeps the link.

**Acceptance Criteria:** the four criteria of TASK-39.

## Implementation Notes

- Supersedes the spec-4-4 matrix row "Absent token: still linked in v1". A token deleted from the open scene now loses its link on every GM client. The status and the menu still read only `link:` records.
- Port: `ScenePort` in `src/platform/ports.ts` (`isReady`, `onReadyChange`, `getItemIds`, `onItemsChange`). The adapter maps Owlbear items to their ids, so no item data leaves `src/platform/obr`. `onItemsChange` can repeat the same list, because Owlbear calls back on every item update, a drag included. `ReplicaEnginePlatform` now picks `scene`.
- Mock: the scene belongs to the `MockRoom`, as Owlbear shows one scene to the whole room. A new room opens ready with no item, so tests that never touch the scene see no removal. Each change is a readiness report or an item report, and the mock sends it even when nothing changed. The page room keeps the scene in localStorage (`mock-scene:{roomId}`, write failures logged) and posts each change with the scene after it, so every page hears each step in order. Test hooks on `MockPlatform`: `setSceneReady`, `addSceneItems`, `removeSceneItems`, `setSceneItems`.
- Core: `removedItemIds(previous, next)` and `tokensToUnlink(removed, records)` in `src/core/token-links.ts`. A token counts when its `link:` record is not a tombstone, so a link to a deleted sheet is cleared too. The tombstone stays a record. The menu filters stop growing with tokens that no longer exist. A token id that fails `tokenIdSchema` is skipped.
- Watch: `src/replica/scene-watch.ts`. A readiness change starts a new period and drops the last list. The same readiness reported again changes nothing. The first list of a period is the baseline: the `getItemIds` read, or a change that arrives before that read, which then wins. Changes while not ready are ignored. A non-empty list that shares no id with a non-empty previous list is a new baseline: a backstop for a scene switch Owlbear does not announce. A removal waits until `isReady()`, asked after the list arrived, still answers true in the same period, because Owlbear may send a closing scene's empty list before it reports the scene not ready. A removed id that shows in a later list stops waiting. Every failed read (first readiness, first list, the re-check) is tried again after `SCENE_READ_RETRY_MS` (500 ms, `src/core/timing.ts`) while the period is unchanged, and a removal stays waiting through a failed re-check. The watch also reports every list it sees (`present`).
- Engine: only a GM client watches. `changeRole` starts or stops the watch, and a new watch has seen no item. A demoted GM drops the tokens it held. The engine keeps the ids it saw deleted in this session (`deletedTokens`, at most 1024, oldest dropped). An id leaves the set when it shows in the scene again. Whenever the client is live and not importing, every live link to an id in the set gets one `link-clear` per token: on a removal, when a catch-up ends, when an import ends (in its `finally`, so also when it stops or is replaced), and when remote records change the replica (another GM may link a token this client saw deleted). The commands run through `runCommand`, the GM path of `handleCommand` without `recentCommandIds`, which only guards against window repeats. Their refusal sends nothing. The token stays in the set, so the next check tries again.
- Two GMs: each GM tombstones the record with `c` + 1, and merge keeps one winner. A GM that already merged the other GM's tombstone sends nothing.
- Player: a player client never reads the scene. A token a player deletes is gone from the scene, so the GM clients unlink it. This is intended.
- Undo: an Owlbear undo that brings the token back does not restore the link. The token leaves `deletedTokens`, so the GM can link it again, and another GM's new link stays.
- Import: unchanged. Imported links to tokens that are not in the scene were never seen, so they stay.
- Tests: `src/core/token-links.test.ts` (removal helpers); `src/replica/scene-watch.test.ts` (scene switch A → B → A step by step, repeated readiness, unannounced switch, closing scene, re-check, baseline race, retries, stop); `src/replica/engine-scene.test.ts` (delete, several, other scene, scene change step by step, not loaded, undo, player, player promoted, demoted GM, engine stop, catch-up, catch-up with the link cleared meanwhile, two GMs, a late link from another GM, relink after undo); `src/replica/engine-import.test.ts` (deletion during a gated import); `src/platform/mock/index.test.ts` (shared scene, repeated reports, page room order); two e2e tests in `tests/link.e2e.ts`. A mutation check made each guard fail its test. Two guards have no test that can fail: the silent refusal and the `importing` check in `clearDeletedLinks`. No current path reaches a refused scene clear, and the retry from `deletedTokens` already recovers a clear refused during an import.

## Spec Change Log

## Review Triage Log

Round 1 (Blind Hunter, Edge Case Hunter, Verification Gap):

| Finding | Source | Disposition |
| --- | --- | --- |
| Removals queued during an import stay stranded when the import is superseded, stops or throws | EC, BH, VG | patch: clear in `finally`; gated-import test |
| A refused scene `link-clear` is dropped after the queue empties | EC | patch: session set `deletedTokens` keeps the id until the item returns |
| Another GM's later `link-set` for a deleted token stays live | EC | patch: checked in `receiveRecords`; test |
| First `isReady`/`getItemIds` or the re-check rejecting loses the period or the removal | EC, BH | patch: retry after `SCENE_READ_RETRY_MS` while the period holds |
| A repeated `onReadyChange(true)` resets the baseline | EC | patch: ignored |
| An unannounced scene switch unlinks the whole scene | EC, BH | patch: a non-empty list sharing no id with the previous one is a new baseline |
| Mock drops unchanged item lists; Owlbear repeats them | BH | patch: port comment and mock fire on every update |
| Scene tests apply all steps in one tick | BH | patch: steps separated by `await`; A → B → A covered |
| GM demotion and `engine.stop()` paths untested | BH, VG | patch: tests |
| Scene command ids fill `recentCommandIds` | BH | patch: engine-made commands bypass it |
| Page-room `setScene` throws on storage failure; no unit test | EC, BH | patch: try/catch and an ordering test |
| Comment claims no orphan record stays | BH | patch: comment corrected |
| Player deleting their own token unlinks it; undo does not restore; one command per token | BH | defer: recorded in Implementation Notes |
| Concurrent page-room `setScene` is not atomic | EC | reject: test mock only, one writer per test |
| Docs (`deferred-work.md`, `epics.md`) still say the scene is never read | BH | patch: `deferred-work.md` updated at close |
| Live Owlbear event order on scene change unverified | BH | defer: owner check in a live room |

## Design Notes

- Detecting by "seen, then gone within one ready period" keeps links of other scenes safe without a scene id.
- This also stops new orphan `link:` records from growing (deferred from 4.4); old orphans from before this fix stay until a cleanup (not in scope).
- Update spec-4-4's matrix decision "Absent token: still linked in v1" by reference in Implementation Notes; do not edit the closed spec.

## Verification

**Commands:**
- `bunx oxfmt --ignore-path .gitignore --check .`, `bun run lint`, `bun run typecheck`, `bun test`, `bun run test:browser`, `bunx vite build` -- expected: exit 0.

**Manual checks (if no CLI):**
- Owner, in a live room: link a token, delete it, the sheet shows no link; switch scenes and back, links of the other scene stay.
