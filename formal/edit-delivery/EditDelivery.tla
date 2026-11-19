---------------------------- MODULE EditDelivery ----------------------------
(***************************************************************************)
(* Edit delivery (AD-4, AD-5): one player's pending edit of one field      *)
(* reaching the room through one GM client.                                *)
(*                                                                         *)
(* Player side: src/replica/pending-edits.ts over proposal-queue.ts and    *)
(* src/core/version-minter.ts. GM side: receiveProposal in                 *)
(* room-protocol.ts with checkProposal in core/access.ts, commit-outbox.ts *)
(* and the FIFO send queue of platform/send-queue.ts. Each action names    *)
(* the function it models. The skill .claude/skills/edit-delivery/SKILL.md *)
(* holds the code map, the bounds and what is left out.                    *)
(*                                                                         *)
(* A cell is [v |-> value, c |-> counter, a |-> author, s |-> edit]. `s`   *)
(* is a ghost: the number of the player's edit that made the cell, 0 for   *)
(* a GM's edit. No action reads it to decide anything.                     *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
  PlayerValues,   \* values the player can type into the field
  GmValues,       \* values the GM can type into the field
  MaxEdits,       \* player edits accepted by `edit`
  MaxGmEdits,     \* GM edits of the field
  MaxGmFlips,     \* times the GM client leaves or re-enters `live`
  MaxRevokes,     \* 0 or 1: the GM revokes the player's write access
  MaxCatchUps,    \* catch-ups the player enters on its own (party change)
  MaxLosses,      \* room messages lost (a send the queue gives up on)
  AllowTooLarge,  \* whether an edit can make the entry too large
  Mutation        \* "none", or one broken variant of the code (formal/edit-delivery/broken/)

VARIABLES
  \* player client
  entry,      \* the proposal-queue entry of the key: has, val, seq, rc (0 = record null), sent
  armed,      \* proposal-queue `resends` holds the key (a resend timer runs)
  queued,     \* proposal-queue `queued` holds the key (a `propose` waits in the send queue)
  pCell,      \* the player's replica record of the field
  pAllowed,   \* the player's replica gives it write access
  catching,   \* the player client is in catch-up
  pLink,      \* the player's gmLink: "online" or "offline"
  lastMinted, \* version-minter lastMintedByKey for the key
  edits,      \* edits accepted so far; edit n gets seq n
  \* GM client
  gLive,      \* the GM client is live and has persistence (receiveProposal's gate)
  gCell,      \* the GM's replica record of the field
  gAllowed,   \* the GM's replica gives the player write access
  outbox,     \* commit-outbox: held field record, the player's ack, a held revoke, `scheduled`
  gQueue,     \* the GM's send queue: "slot" (the outbox's composed commit) and rejects, FIFO
  \* room messages in flight
  toGM,       \* `propose` messages, a set: any order, a copy collapses into one
  toP,        \* messages to the player, FIFO: `commit` and `reject`
  \* ghosts
  applyCount, \* edit seq -> how many times the GM merged a cell of that edit
  reported,   \* edit seqs dropped with a denial notice (its text names the cause)
  noop,       \* edit seqs dropped because the known record already held the value
  proposed,   \* <<c, seq>> of every version the player sent
  \* budgets
  gmEdits, gmFlips, revokes, catchUps, losses

vars == <<entry, armed, queued, pCell, pAllowed, catching, pLink, lastMinted, edits,
          gLive, gCell, gAllowed, outbox, gQueue, toGM, toP,
          applyCount, reported, noop, proposed,
          gmEdits, gmFlips, revokes, catchUps, losses>>

playerVars == <<entry, armed, queued, pCell, pAllowed, catching, pLink, lastMinted, edits>>
gmVars == <<gLive, gCell, gAllowed, outbox, gQueue>>
ghostVars == <<applyCount, reported, noop, proposed>>
budgetVars == <<gmEdits, gmFlips, revokes, catchUps, losses>>

Max(x, y) == IF x >= y THEN x ELSE y

\* compareVersions in core/merge.ts orders authors by connection id. The player's id is
\* taken above the GM's, so a player cell wins every tie on a merge.
Rank(a) == IF a = "P" THEN 2 ELSE 1

\* compareCells in core/merge.ts: counter, then author, then value.
Beats(x, y) ==
  \/ x.c > y.c
  \/ x.c = y.c /\ Rank(x.a) > Rank(y.a)
  \/ x.c = y.c /\ x.a = y.a /\ x.v > y.v

\* mergeBlock in core/merge.ts for one cell.
MergeCell(x, y) == IF Beats(y, x) THEN y ELSE x

NoEntry == [has |-> FALSE, val |-> 0, seq |-> 0, rc |-> 0, sent |-> FALSE]
NoCell == [v |-> 0, c |-> 0, a |-> "G", s |-> 0]
NoOutbox == [cell |-> NoCell, ack |-> 0, revoke |-> FALSE, scheduled |-> FALSE]
InitCell == [v |-> 0, c |-> 1, a |-> "G", s |-> 0]

Msg(t, cell, c, reason, revoke) ==
  [t |-> t, cell |-> cell, c |-> c, reason |-> reason, revoke |-> revoke]
Slot == Msg("slot", NoCell, 0, "none", FALSE)

\* A message that is already queued is not queued twice. Its second copy would find the
\* entry already moved past it (see the skill), so it changes nothing.
AppendNew(q, m) == IF \E i \in 1..Len(q) : q[i] = m THEN q ELSE Append(q, m)
RemoveAt(q, i) == SubSeq(q, 1, i - 1) \o SubSeq(q, i + 1, Len(q))

\* core/version-minter.ts mint: above the highest known counter and the last one minted.
\* Broken variant "mint-forgets": the minter keeps no last counter per key.
Mint(highest) ==
  IF Mutation = "mint-forgets" THEN highest + 1 ELSE Max(highest, lastMinted) + 1

Applied == {s \in 1..MaxEdits : applyCount[s] > 0}

Init ==
  /\ entry = NoEntry
  /\ armed = FALSE
  /\ queued = FALSE
  /\ pCell = InitCell
  /\ pAllowed = TRUE
  /\ catching = FALSE
  /\ pLink = "online"
  /\ lastMinted = 0
  /\ edits = 0
  /\ gLive = TRUE
  /\ gCell = InitCell
  /\ gAllowed = TRUE
  /\ outbox = NoOutbox
  /\ gQueue = <<>>
  /\ toGM = {}
  /\ toP = <<>>
  /\ applyCount = [s \in 1..MaxEdits |-> 0]
  /\ reported = {}
  /\ noop = {}
  /\ proposed = {}
  /\ gmEdits = 0 /\ gmFlips = 0 /\ revokes = 0 /\ catchUps = 0 /\ losses = 0

-----------------------------------------------------------------------------
\* proposal-queue.ts operations on the one key.

\* drop: the entry, its waiting send and its resend go.
Drop == entry' = NoEntry /\ queued' = FALSE /\ armed' = FALSE

\* put with a minted record: propose = sendNow + armResend.
PutMinted(e) == entry' = e /\ queued' = TRUE /\ armed' = TRUE

\* put with record null: the entry waits for a `c`, its resend stops.
PutWaiting(e) == entry' = [e EXCEPT !.rc = 0] /\ armed' = FALSE /\ UNCHANGED queued

\* hold: replaced, sent on the running backoff (armResend only when none runs).
Hold(e) == entry' = e /\ armed' = TRUE /\ UNCHANGED queued

\* commit-outbox.ts add: a held record merges with the newer one, withAck keeps the
\* newest ack of each author, and the first add since the last take schedules one
\* composed commit at the end of the send queue.
OutboxAdd(cell, ack, revoke) ==
  /\ outbox' = [cell |-> MergeCell(outbox.cell, cell),
                ack |-> Max(outbox.ack, ack),
                revoke |-> outbox.revoke \/ revoke,
                scheduled |-> TRUE]
  /\ gQueue' = IF outbox.scheduled THEN gQueue ELSE Append(gQueue, Slot)

-----------------------------------------------------------------------------
\* Player actions.

\* pending-edits.ts edit: an accepted edit of the field to `v`. `big`: the entry grows
\* too large for one message (rebuiltRecord returns too-large).
PlayerEdits(v, big) ==
  /\ edits < MaxEdits
  /\ pAllowed                              \* playerMayEdit; a refused edit is not accepted
  /\ big => AllowTooLarge /\ ~catching     \* no size check runs during catch-up
  /\ LET s == edits + 1
         e == [has |-> TRUE, val |-> v, seq |-> s,
               rc |-> IF entry.has THEN entry.rc ELSE 0,
               sent |-> entry.has /\ entry.sent]
     IN /\ edits' = s
        /\ IF catching
             THEN PutWaiting(e) /\ UNCHANGED <<lastMinted, reported, noop>>
           ELSE IF ~e.sent /\ v = pCell.v       \* proposedRecord: unchanged, before mint
             THEN Drop /\ noop' = noop \cup {s} /\ UNCHANGED <<lastMinted, reported>>
           ELSE LET c == Mint(Max(pCell.c, e.rc)) IN
                /\ lastMinted' = c
                /\ IF big
                     THEN Drop /\ reported' = reported \cup {s} /\ UNCHANGED noop
                     ELSE PutMinted([e EXCEPT !.rc = c]) /\ UNCHANGED <<reported, noop>>
  /\ UNCHANGED <<pCell, pAllowed, catching, pLink>>
  /\ UNCHANGED <<gmVars, toGM, toP, applyCount, proposed, budgetVars>>

\* proposal-queue.ts sendNow's compose: the send queue takes the waiting `propose`
\* and gets the entry's newest version, or nothing.
QueueTakesPropose ==
  /\ queued
  /\ queued' = FALSE
  /\ IF entry.has /\ entry.rc # 0
       THEN /\ entry' = [entry EXCEPT !.sent = TRUE]
            /\ toGM' = toGM \cup {[c |-> entry.rc, v |-> entry.val, s |-> entry.seq]}
            /\ proposed' = proposed \cup {<<entry.rc, entry.seq>>}
       ELSE UNCHANGED <<entry, toGM, proposed>>
  /\ UNCHANGED <<armed, pCell, pAllowed, catching, pLink, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toP, applyCount, reported, noop, budgetVars>>

\* proposal-queue.ts armResend's timer. Broken variant "resend-once": it does not re-arm.
ResendFires ==
  /\ armed
  /\ IF entry.has /\ entry.rc # 0
       THEN queued' = TRUE /\ armed' = (Mutation # "resend-once")
       ELSE armed' = FALSE /\ UNCHANGED queued
  /\ UNCHANGED <<entry, pCell, pAllowed, catching, pLink, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toGM, toP, ghostVars, budgetVars>>

\* catch-up-table.ts livenessFired on 'gm-silence': no GM-origin message for the timeout,
\* so the liveness phase goes offline.
GmLinkLost ==
  /\ pLink = "online"
  /\ ~gLive
  /\ pLink' = "offline"
  /\ UNCHANGED <<entry, armed, queued, pCell, pAllowed, catching, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toGM, toP, ghostVars, budgetVars>>

\* A GM-origin message heard while offline (catch-up.ts heard): catch-up-table.ts
\* livenessHeard emits `gm-back`, which catch-up-effects.ts runs as pending-edits gmBack =
\* resendAll, and catchUpHeard makes a live player enter catch-up ('gm-return'). Both run in
\* one synchronous catch-up-effects.ts run.
GmBack ==
  /\ pLink = "offline"
  /\ gLive
  /\ pLink' = "online"
  /\ IF entry.has /\ entry.rc # 0
       THEN queued' = TRUE /\ armed' = TRUE
       ELSE UNCHANGED <<queued, armed>>
  /\ catching' = TRUE
  /\ UNCHANGED <<entry, pCell, pAllowed, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toGM, toP, ghostVars, budgetVars>>

\* engine.ts enterCatchUp on a role change or a page return -> catch-up-table.ts
\* catchUpEnter.
CatchUpStarts ==
  /\ ~catching
  /\ catchUps < MaxCatchUps
  /\ catching' = TRUE
  /\ catchUps' = catchUps + 1
  /\ UNCHANGED <<entry, armed, queued, pCell, pAllowed, pLink, lastMinted, edits>>
  /\ UNCHANGED <<gmVars, toGM, toP, ghostVars, gmEdits, gmFlips, revokes, losses>>

\* catch-up-table.ts leave emits `caught-up` -> catch-up-effects.ts -> engine.ts
\* performCaughtUp -> pending-edits.ts caughtUp. With the GM live, its `state` answer
\* merged first in the same handler (room-protocol.ts receiveState: receiveRecords ->
\* recordsChanged, then stateMerged -> leave); without it, the 'catch-up' timer's exit.
CatchUpEnds ==
  /\ catching
  /\ catching' = FALSE
  /\ LET base == IF gLive THEN MergeCell(pCell, gCell) ELSE pCell
         allowed == IF gLive THEN gAllowed ELSE pAllowed
     IN /\ pCell' = base
        /\ pAllowed' = allowed
        /\ IF entry.has /\ ~allowed
             THEN Drop /\ reported' = reported \cup {entry.seq}
                  /\ UNCHANGED <<noop, lastMinted>>
           ELSE IF entry.has /\ entry.rc = 0
             THEN IF ~entry.sent /\ entry.val = base.v
                    THEN Drop /\ noop' = noop \cup {entry.seq}
                         /\ UNCHANGED <<reported, lastMinted>>
                    ELSE LET c == Mint(base.c) IN
                         /\ lastMinted' = c
                         /\ PutMinted([entry EXCEPT !.rc = c])
                         /\ UNCHANGED <<reported, noop>>
           ELSE UNCHANGED <<entry, queued, armed, reported, noop, lastMinted>>
  /\ UNCHANGED <<pLink, edits, gmVars, toGM, toP, applyCount, proposed, budgetVars>>

\* room-protocol.ts dispatchRoomMessage on the player, for the oldest message: `commit`
\* (answered, then receiveRecords -> recordsChanged for a revoke it carries) or `reject`
\* (receiveReject -> rejected, then receiveRecords of its current record).
PlayerReceives ==
  /\ Len(toP) > 0
  /\ toP' = Tail(toP)
  /\ LET m == Head(toP) IN
     IF m.t = "commit"
       THEN LET cleared ==   \* broken variant "ack-any": any ack of the key clears the entry
                  /\ entry.has /\ entry.rc # 0
                  /\ \/ entry.rc = m.c
                     \/ Mutation = "ack-any" /\ m.c # 0 IN
            /\ pCell' = MergeCell(pCell, m.cell)
            /\ pAllowed' = (pAllowed /\ ~m.revoke)
            /\ IF cleared
                 THEN Drop /\ UNCHANGED reported
               ELSE IF m.revoke /\ entry.has
                 THEN Drop /\ reported' = reported \cup {entry.seq}
               ELSE UNCHANGED <<entry, queued, armed, reported>>
            /\ UNCHANGED <<lastMinted, noop>>
     ELSE IF ~(entry.has /\ entry.rc # 0 /\ entry.rc = m.c)
       THEN UNCHANGED <<entry, queued, armed, pCell, pAllowed, lastMinted, reported, noop>>
     ELSE IF m.reason = "denied"    \* broken variant "denied-silent": no notice
       THEN /\ Drop
            /\ reported' = (IF Mutation = "denied-silent"
                              THEN reported ELSE reported \cup {entry.seq})
            /\ UNCHANGED <<pCell, pAllowed, lastMinted, noop>>
     ELSE LET base == MergeCell(pCell, m.cell) IN
          /\ pCell' = base
          /\ IF catching
               THEN PutWaiting(entry) /\ UNCHANGED <<lastMinted, reported, noop>>
             ELSE IF entry.val = base.v           \* proposeEntry force=false: unchanged
               THEN Drop /\ noop' = noop \cup {entry.seq}
                    /\ UNCHANGED <<lastMinted, reported>>
             ELSE LET c == Mint(Max(base.c, entry.rc)) IN
                  /\ lastMinted' = c
                  /\ IF entry.rc > m.cell.c       \* counterAbove: hold for the backoff
                       THEN Hold([entry EXCEPT !.rc = c])
                       ELSE PutMinted([entry EXCEPT !.rc = c])
                  /\ UNCHANGED <<reported, noop>>
          /\ UNCHANGED pAllowed
  /\ UNCHANGED <<catching, pLink, edits, gmVars, toGM, applyCount, proposed, budgetVars>>

-----------------------------------------------------------------------------
\* GM actions.

\* room-protocol.ts receiveProposal with core/access.ts checkProposal.
GmReceives(m) ==
  /\ m \in toGM
  /\ toGM' = toGM \ {m}
  /\ LET pc == [v |-> m.v, c |-> m.c, a |-> "P", s |-> m.s] IN
     IF ~gLive                                                   \* dropped, no answer
       THEN UNCHANGED <<gCell, outbox, gQueue, applyCount>>
     ELSE IF ~gAllowed                                           \* denied
       THEN gQueue' = AppendNew(gQueue, Msg("reject", NoCell, m.c, "denied", FALSE))
            /\ UNCHANGED <<gCell, outbox, applyCount>>
     ELSE IF Mutation = "gm-overwrites"     \* broken variant: no counter check, no merge
       THEN /\ gCell' = pc
            /\ applyCount' = [applyCount EXCEPT ![m.s] = @ + 1]
            /\ OutboxAdd(pc, m.c, FALSE)
     ELSE IF pc = gCell                                          \* commit-existing
       THEN OutboxAdd(gCell, m.c, FALSE) /\ UNCHANGED <<gCell, applyCount>>
     ELSE IF m.c <= gCell.c                                      \* stale
       THEN gQueue' = AppendNew(gQueue, Msg("reject", gCell, m.c, "stale", FALSE))
            /\ UNCHANGED <<gCell, outbox, applyCount>>
     ELSE /\ gCell' = MergeCell(gCell, pc)                       \* commit
          /\ applyCount' = [applyCount EXCEPT ![m.s] = @ + 1]
          /\ OutboxAdd(MergeCell(gCell, pc), m.c, FALSE)
  /\ UNCHANGED <<playerVars, gLive, gAllowed, toP, reported, noop, proposed, budgetVars>>

\* A GM's own edit: engine command -> apply -> sendCommits.
GmEdits(v) ==
  /\ gmEdits < MaxGmEdits
  /\ gLive
  /\ gmEdits' = gmEdits + 1
  /\ gCell' = [v |-> v, c |-> gCell.c + 1, a |-> "G", s |-> 0]
  /\ OutboxAdd([v |-> v, c |-> gCell.c + 1, a |-> "G", s |-> 0], 0, FALSE)
  /\ UNCHANGED <<playerVars, gLive, gAllowed, toGM, toP, ghostVars>>
  /\ UNCHANGED <<gmFlips, revokes, catchUps, losses>>

\* The GM revokes write access; its access record goes out in the outbox's next commit.
GmRevokes ==
  /\ revokes < MaxRevokes
  /\ gLive
  /\ gAllowed
  /\ revokes' = revokes + 1
  /\ gAllowed' = FALSE
  /\ OutboxAdd(NoCell, 0, TRUE)
  /\ UNCHANGED <<playerVars, gLive, gCell, toGM, toP, ghostVars>>
  /\ UNCHANGED <<gmEdits, gmFlips, catchUps, losses>>

\* The GM client leaves `live` (catch-up, closed tab) or comes back.
GmFlips ==
  /\ gmFlips < MaxGmFlips
  /\ gmFlips' = gmFlips + 1
  /\ gLive' = ~gLive
  /\ UNCHANGED <<playerVars, gCell, gAllowed, outbox, gQueue, toGM, toP, ghostVars>>
  /\ UNCHANGED <<gmEdits, revokes, catchUps, losses>>

\* send-queue.ts drain takes the oldest item. The outbox's slot composes its commit now
\* (commit-outbox.ts take), with what is held at this moment.
GmQueueSends ==
  /\ Len(gQueue) > 0
  /\ gQueue' = Tail(gQueue)
  /\ LET item == Head(gQueue) IN
     IF item.t = "slot"
       THEN /\ outbox' = NoOutbox
            /\ toP' = IF outbox.cell = NoCell /\ ~outbox.revoke
                        THEN toP
                        ELSE AppendNew(toP, Msg("commit", outbox.cell, outbox.ack, "none",
                                                outbox.revoke))
       ELSE toP' = AppendNew(toP, item) /\ UNCHANGED outbox
  /\ UNCHANGED <<playerVars, gLive, gCell, gAllowed, toGM, ghostVars, budgetVars>>

-----------------------------------------------------------------------------
\* The send queue gives up on a message (send-queue.ts: a non-rate-limit error).

ProposeLost(m) ==
  /\ m \in toGM /\ losses < MaxLosses
  /\ toGM' = toGM \ {m} /\ losses' = losses + 1
  /\ UNCHANGED <<playerVars, gmVars, toP, ghostVars, gmEdits, gmFlips, revokes, catchUps>>

AnswerLost(i) ==
  /\ i \in 1..Len(toP) /\ losses < MaxLosses
  /\ toP' = RemoveAt(toP, i) /\ losses' = losses + 1
  /\ UNCHANGED <<playerVars, gmVars, toGM, ghostVars, gmEdits, gmFlips, revokes, catchUps>>

\* Nothing is left to deliver: no entry, no queued send, no message in flight.
Done ==
  /\ ~entry.has /\ ~queued /\ gQueue = <<>> /\ toGM = {} /\ toP = <<>>
  /\ UNCHANGED vars

\* Named, so TLC and the chart name each step by its action.
PlayerEdit == \E v \in PlayerValues, big \in BOOLEAN : PlayerEdits(v, big)
GmAnswers == \E m \in toGM : GmReceives(m)
GmEdit == \E v \in GmValues : GmEdits(v)
ProposeLoss == \E m \in toGM : ProposeLost(m)
AnswerLoss == \E i \in 1..Len(toP) : AnswerLost(i)

Next ==
  \/ PlayerEdit
  \/ QueueTakesPropose
  \/ ResendFires
  \/ GmLinkLost
  \/ GmBack
  \/ CatchUpStarts
  \/ CatchUpEnds
  \/ PlayerReceives
  \/ GmAnswers
  \/ GmEdit
  \/ GmRevokes
  \/ GmFlips
  \/ GmQueueSends
  \/ ProposeLoss
  \/ AnswerLoss
  \/ Done

\* Every step the code takes on its own happens: timers fire, send queues drain,
\* messages arrive, catch-up ends, a lost GM link comes back. Losses, flips and edits are
\* bounded, never forced.
Fairness ==
  /\ WF_vars(QueueTakesPropose)
  /\ WF_vars(ResendFires)
  /\ WF_vars(GmBack)
  /\ WF_vars(CatchUpEnds)
  /\ WF_vars(GmQueueSends)
  /\ WF_vars(PlayerReceives)
  /\ WF_vars(GmAnswers)

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ Fairness

-----------------------------------------------------------------------------
\* Properties.

TypeOK ==
  /\ entry.has \in BOOLEAN /\ entry.rc \in Nat /\ entry.seq \in 0..MaxEdits
  /\ armed \in BOOLEAN /\ queued \in BOOLEAN
  /\ catching \in BOOLEAN /\ gLive \in BOOLEAN
  /\ pLink \in {"online", "offline"}
  /\ edits \in 0..MaxEdits

\* An accepted edit is never lost: it is still pending (alone or folded into a newer
\* edit), the GM merged it or a newer edit, the player was told it is refused, or the
\* record the player knows already held its value.
NoSilentLoss ==
  \A s \in 1..edits :
    \/ entry.has /\ entry.seq >= s
    \/ \E t \in Applied \cup reported \cup noop : t >= s

\* The GM merges each player edit into the room at most once.
NoDoubleApply == \A s \in 1..MaxEdits : applyCount[s] <= 1

\* Once the GM merged a newer edit of this player, the room never shows an older one.
OwnOrderKept == \A s \in Applied : gCell.a = "P" => gCell.s >= s

\* AD-3: the player never sends two different edits under one (k, c, a).
OneVersionOneEdit == \A x, y \in proposed : x[1] = y[1] => x[2] = y[2]

\* A pending edit always has something that sends it again: a minted version has a
\* running resend timer, and an entry with no version exists only during a catch-up,
\* whose end mints it.
NeverStranded ==
  entry.has => \/ entry.rc # 0 /\ armed
               \/ entry.rc = 0 /\ catching

\* After the GM is back for good, every pending edit is answered.
EntryResolves == (<>[]gLive) => (entry.has ~> ~entry.has)

=============================================================================
