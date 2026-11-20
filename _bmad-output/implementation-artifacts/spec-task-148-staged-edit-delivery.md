---
title: 'TASK-148: Check staged edits across refusal and GM return'
type: 'chore'
created: '2026-11-20'
status: 'in-progress'
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
