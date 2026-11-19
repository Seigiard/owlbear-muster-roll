---
title: 'TASK-129: Keep a client own state answer during adoption'
type: 'bugfix'
created: '2026-11-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Since TASK-115.1 made adoption its own phase kind, `answersOwn` in `src/replica/catch-up.ts` counts only the `catching-up` phase. A client adopting G2 that gets a G3 `state` answer to its own active request therefore reaches `seeGeneration` with `keepNonce = false`: it takes a new nonce, drops the valid answer and asks every GM for full state again (TASK-129; formal finding 5 of `replica-catch-up`).

**Approach:** `answersOwn` counts the active nonce in both the `catching-up` and the `adopting` phase, as on master before TASK-115.1. Pin it with a `catch-up.test.ts` test and a room-level test that the adopting client keeps its nonce, merges the G3 answer and sends no second `state-request`. Then make the fixed behavior the `replica-catch-up` model's `AnswersOwn` as its SKILL.md finding 5 prescribes, and move the sync commits of the models that cover `catch-up.ts`.

</frozen-after-approval>

## Implementation Notes

- `src/replica/catch-up.ts` `answersOwn` now uses `isCatchingUp`, exported from `catch-up-table.ts`, the same check `enterFromGeneration` uses to keep a nonce. A new phase kind with an active request is then counted in one place.
- Tests: `catch-up.test.ts` "answersOwn is true only for the active nonce of an adopting client" (red before the fix; also red for an `answersOwn` that is true for any `r` while adopting). `engine-import.test.ts` "an adopting client keeps its request when a GM of a still higher generation answers it": a GM adopting the ghost's generation 1 gets a generation 2 `state` for its own request; red before the fix (one more `state-request`, old data kept), green after (live, no new request, generation 2 records shown and stored).
- Model (`formal/catch-up`): `AnswersOwn` is the fixed behavior; the TASK-129 finding config became `mutations/answers-own-ordinary-only.cfg` (fails on `OwnAnswerKeepsRequest`); `imports.cfg` and `imports-gm.cfg` check `OwnAnswerKeepsRequest` and hold with the state counts of the removed fix configs (58,020 and 1,391,749); both fix configs are deleted. Sync commits of the three models whose `coverage.txt` lists `catch-up.ts` move to the fix commit; generation-adoption already treats an answer of the adopted generation as the current answer, and edit-delivery covers only `heard` and `feed` ordering.
- Checks: oxfmt, lint, typecheck, `bun test` (3605 pass), `bun run test:browser` (587 pass), `bun run build`, `formal/catch-up/check.sh` exit 0.

## Review Triage Log

- coverage.txt files keep `sync 995e1c7` — medium, real: planned step, patched in the model commit with the fix commit's hash.
- edit-delivery coverage not moved — medium, real: patched with the same sync move; its model does not describe `answersOwn`.
- SKILL.md §4 names the removed coverage command — low, real: patched to name `formal/catch-up/coverage.txt`.
- deferred-work.md still calls TASK-129 shipped — low, real: patched with the resolved note, as earlier entries do.
- fix repeats the hand-written phase check — medium, real (the regression came from such a check): patched, `answersOwn` uses the exported `isCatchingUp`.
- unit test has only a positive case — medium, real: an `answersOwn` true for any `r` while adopting passed; patched with the pre-adoption nonce as a negative case, seen red on that variant.
- no unit test for `generationHeard(higher, true)` while adopting — false as a gap of this change: `enterFromGeneration` is unchanged, and the engine test drives that path end to end.
- engine test covers only a GM — low, rejected: the fix is in `answersOwn`, shared by both roles; the model's `imports.cfg` checks the player path.
- engine test does not assert `live` — low, real: patched, `state: 'live'` is in the expectation.
- spec has empty Implementation Notes — low, real: patched here.
- backlog task not finished — not a code finding; finalization follows the commit.
- SKILL.md says the `fixes/` folder is empty, but git drops it — low, real: patched wording; `check.sh` guards every config loop against an empty folder.
- "Fixed" note lost "introduced by" and backticks, and does not name the deleted config — low, real: patched.
- `OwnAnswerKeepsRequest` row lost its config list — low, real: patched.
- §2 runtime not re-measured — false: the run after the change took about 5 minutes, as the text says.
