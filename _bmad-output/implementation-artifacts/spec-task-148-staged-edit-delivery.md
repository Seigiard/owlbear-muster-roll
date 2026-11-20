---
title: 'TASK-148: Check staged edits across refusal and GM return'
type: 'chore'
created: '2026-11-20'
status: 'done'
route: 'oneshot'
baseline_commit: 'e42fe7e43b193f1707ee62736d32afd01b0883ba'
review_loop_iteration: 0
context: ['{project-root}/GLOSSARY.md']
---

<frozen-after-approval reason="human-owned intent">

## Intent

**Problem:** The two-field delivery check can stage an edit on a second field, but it cannot check a refusal or GM return. The existing refusal and liveness checks only model one field, so the staged batch stays empty.

**Approach:** Check two fields of one block with a bounded refusal scenario and a fair resend scenario. When a matching refusal or a revoke arrives with a second edit staged, the model must not lose that edit without an answer or a report. When the GM comes back and stays available, the model must resolve the pending entry under explicit fairness assumptions. Verify that both scenarios reach a non-empty staged batch. Record the bounds, limits, and run times.

Keep the existing checks. Model a GM reload with saved records intact and the in-memory history of accepted proposals empty. Add a separate expected failure for the known path where a lost acknowledgement, a GM correction to the same field, and a reload before resend let the original player edit overwrite that correction. Explain the path next to the TASK-119 and AD-4 note. Do not change `src/` or add an application regression test or a follow-up task for the accepted race.

</frozen-after-approval>

## Implementation Notes

- TLC reached a non-empty staged batch before a matching denial, before a revoke, and before the GM link came back. A separate trace stages the edit before the GM leaves, then loses the proposal sent on GM return. The timer remains armed with no proposal or reply in flight.
- In scratch controls, omitting the staged commands from the denial report broke `NoSilentLoss`. Suppressing the timer for staged entries after reload broke `EntryResolves`. Keeping the GM's memory across the interruption made the reload control pass.
- The reload control breaks `NoOldCellReplayAfterLostAck` in 16 transitions. The real replica engine on the mock platform persisted `str=11` over the GM's `str=15` after reload. Without reload it persisted only the later `note` and kept `str=15`. No application regression test was added.
- One local run of `formal/edit-delivery/check.sh` matched all 16 expected outcomes in 101 seconds. TLC completed the refusal check in 1 second and the return check in 7 seconds, with 37,421 and 52,270 distinct states respectively. TLC found the expected reload counterexample in 2 seconds on the same run. `formal/drift.sh` passed; the sync commit stayed put because the covered files did not change.
- The confirming run after updating the guide matched all 16 outcomes in 77 seconds. Both independent reviewers reported no remaining findings.

## Review Triage Log

| Finding | Verdict | Result |
| --- | --- | --- |
| The guide attributed intact GM memory to `StagedReturn.cfg`. | Low, fixed | Both reload configs select `GmReload`. The guide now distinguishes them from the memory-preserving configs and distinguishes independent catch-up from `GmBack`. |
| The guide called the reload path outside the model. | Low, fixed | The known-limit note now names the expected failure and keeps the second-GM path outside the model. |
| The reload action's map attributed delivery to the wrong action and omitted its source. | Low, fixed | The map names the engine and protocol reset. `GmReceives` handles the resend. |
| An ACK lost after the history reset is not tracked by the replay witness. | Outside this check's bound | The guide specifies that the loss is observed while the GM still remembers the commit. |
| The replay witness does not require the correction before reload and does not cover staging before the correction. | Outside this check's bound | The guide describes the bounded witness. TLC and the engine both reproduced correction before reload and resend after reload. |
