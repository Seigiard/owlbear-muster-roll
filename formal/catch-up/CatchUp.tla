------------------------------ MODULE CatchUp ------------------------------
(***************************************************************************)
(* Catch-up and the GM link of Muster Roll clients in one room.            *)
(*                                                                         *)
(* Each client runs createCatchUp of src/replica/catch-up.ts: its feed    *)
(* steps catchUpTable and livenessTable of src/replica/catch-up-table.ts. *)
(* The engine interprets the decisions with createCatchUpEffects          *)
(* (src/replica/catch-up-effects.ts run, arm, disarm). Room messages pass *)
(* through the admission and dispatch of src/replica/room-protocol.ts.     *)
(* One step is one event the engine hands to the module (a message after  *)
(* its sender lookup, a timer, a finished read, a page or role event)      *)
(* together with the synchronous interpretation of the decisions it        *)
(* returns. Timers have no clock: an armed timer may fire at any step,     *)
(* except where TimingOK states an order that real delays guarantee.      *)
(*                                                                         *)
(* "x" is a GM client of a higher generation (an importer), outside the   *)
(* modeled clients: it writes the room copy, sends `reset` and answers.    *)
(* It can import up to `Imports` times, each time one generation higher.  *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    Clients,        \* the modeled clients, such as {"p", "g"}
    GmClients,      \* the clients that open as GM
    Unreadable,     \* clients whose saved records cannot be read: such a GM never vouches
    MaxIds,         \* newId() calls per client (bounds the catch-up entries)
    MaxOpens,       \* opens per client; above 1 a closed client opens again
    MaxReturns,     \* page returns per client
    MaxRoleChanges, \* role changes per client
    HideClients,    \* the clients whose page can stop its timers for a while
    MaxInFlight,    \* room messages on their way at once
    Imports,        \* how many generations the importer "x" creates in turn (0: no importer)
    SaveCanFail,    \* whether a GM's saveAdoption can return false
    Mutation        \* "none", or the name of a scratch break (see Mutated)

VARIABLES
    life,       \* [c -> {"unopened", "open", "closed"}]
    role,       \* [c -> {"GM", "PLAYER"}] the engine's `role`
    hidden,     \* [c -> BOOLEAN] the page's timers stopped for a while (see TimingOK)
    m,          \* [c -> module record]: the closure state of createCatchUp
    timers,     \* [c -> set of timer keys] the engine's catchUpTimers
    reads,      \* [c -> set of reads in flight] room copy and party reads
    net,        \* set of room messages on their way
    opens, returns, roleChanges, \* per-client bounds
    xLife,      \* "none", "present" or "gone"
    xGen,       \* the importer's generation: 0 before it imports
    copyGen,    \* the generation the room copy holds
    pinged,     \* [c -> BOOLEAN] ghost: a ping went out since gm-silence was last armed
    owed,       \* [c -> set of r] ghost: requests this GM heard and has not answered or seen answered
    dropped,    \* [c -> set of r] ghost: owed requests whose answer timer fired while adopting
    lastHeard,  \* [c -> sender] ghost: the GM client whose message last armed gm-silence
    badOffline, \* [c -> {"no", "visible", "hidden"}] ghost: gm-silence fired while a GM reply was due
    ownDropped  \* [c -> BOOLEAN] ghost: a `state` for the client's active `r` made it take a new `r`

vars == <<life, role, hidden, m, timers, reads, net, opens, returns, roleChanges,
          xLife, xGen, copyGen, pinged, owed, dropped, lastHeard, badOffline, ownDropped>>

Mutated(name) == Mutation = name

InitialRole == [c \in Clients |-> IF c \in GmClients THEN "GM" ELSE "PLAYER"]

NoGen == -1
NoR == <<"none", 0>>
\* The phase kinds of catch-up-table.ts: "ordinary" is the kind 'catching-up'.
CatchingUp == {"ordinary", "adopting"}

Key(kind, r) == [kind |-> kind, r |-> r]
CK == Key("catch-up", NoR)
PK == Key("ping", NoR)
SK == Key("gm-silence", NoR)
RK(r) == Key("request", r)
AK(r) == Key("answer", r)
NoKey == Key("none", NoR)

\* One CatchUpDecision. `rs` carries the answers that leave() schedules for held requests.
D(t) == [type |-> t, k |-> NoKey, r |-> NoR, fresh |-> FALSE, rs |-> {}]
Arm(k) == [D("arm") EXCEPT !.k = k]
Disarm(k) == [D("disarm") EXCEPT !.k = k]
ArmAnswers(rs) == [D("arm-answers") EXCEPT !.rs = rs]
ReadCopy(r, fresh) == [D("read-room-copy") EXCEPT !.r = r, !.fresh = fresh]
ReadParty(r) == [D("read-party") EXCEPT !.r = r]
Request(r) == [D("request") EXCEPT !.r = r]
AnswerD(r) == [D("answer") EXCEPT !.r = r]

\* A module result: the new closure state and the decision list it returns.
Same(M) == [m |-> M, d |-> <<>>]
Res(M, ds) == [m |-> M, d |-> ds]

Own(c, M) == <<c, M.nonce>>

(***************************************************************************)
(* The module: src/replica/catch-up-table.ts, stepped by catch-up.ts feed *)
(***************************************************************************)

\* canAnswer(). The drift clause never holds here, as the model has no drift.
CanAnswer(M) ==
    /\ M.role = "GM"
    /\ M.vouch
    /\ \/ M.phase = "live"
       \/ M.phase = "ordinary" /\ M.trig = "drift"

\* scheduleAnswer(r)
ScheduleAnswer(M, r) ==
    IF ~CanAnswer(M) \/ r \in M.armed THEN Same(M)
    ELSE Res([M EXCEPT !.armed = @ \cup {r}], <<Arm(AK(r))>>)

\* request(r): only the active `r` of a client that catches up goes out.
RequestR(c, M, r) ==
    IF M.phase \notin CatchingUp \/ Own(c, M) # r THEN Same(M)
    ELSE Res([M EXCEPT !.sent = TRUE], <<Request(r)>>)

\* ask(r)
Ask(c, M, r) ==
    IF ~(M.phase \in CatchingUp /\ M.trig = "gm-return") THEN RequestR(c, M, r)
    ELSE Res(M, <<Arm(RK(r))>>)

\* leave(exit). The phase `live` drops the active catch-up, so its fields reset.
Leave(c, M, exit) ==
    IF M.phase # "ordinary" THEN Same(M)
    ELSE LET M1 == [M EXCEPT !.phase = "live", !.trig = "none", !.nonce = 0,
                            !.sent = FALSE, !.seen = FALSE, !.firstDone = TRUE,
                            !.gmAnswered = @ \/ exit = "answered", !.held = {}]
             rs == IF CanAnswer(M1) /\ ~Mutated("drop-held")
                   THEN {r \in M.held : r \notin M.answered /\ r \notin M.armed}
                   ELSE {}
         IN Res([M1 EXCEPT !.armed = @ \cup rs],
                <<Disarm(CK), D("caught-up"), ArmAnswers(rs)>>)

\* catchUpEnter. `adoptTo` is the adopting phase that enterFromGeneration builds first.
Enter(c, M, t, adoptTo) ==
    IF t = "page-return" /\ M.phase \in CatchingUp
    THEN Res(M, <<D("entered"), ReadCopy(Own(c, M), FALSE)>>)
    ELSE LET n == M.ids + 1
             mode == IF adoptTo # NoGen THEN adoptTo
                     ELSE IF M.phase = "adopting" THEN M.target ELSE NoGen
             M1 == [M EXCEPT !.phase = IF mode = NoGen THEN "ordinary" ELSE "adopting",
                             !.target = mode, !.trig = t, !.nonce = n, !.ids = n,
                             !.sent = FALSE, !.seen = FALSE, !.last = n, !.pend = "none"]
         IN Res(M1, <<D("entered")>>
                    \o (IF Mutated("no-timeout-on-enter") THEN <<>> ELSE <<Arm(CK)>>)
                    \o <<ReadCopy(<<c, n>>, TRUE)>>)

\* livenessWatch (catchUpTable ignores `watch`)
Watch(M) ==
    Res(M, <<Arm(PK)>> \o (IF Mutated("no-silence-rearm") THEN <<>> ELSE <<Arm(SK)>>))

\* livenessHeard and livenessFired('gm-silence'), together with catchUpHeard,
\* in the order createCatchUp feed returns their decisions for `heard`: arms,
\* gm-back, then a gm-return entry (no show) or a repeated request and show.
\* catchUpHeard reads env.gmLink, the link before this event.
SetGmLink(c, M, next, answersOwn) ==
    IF M.link = next THEN Same(M)
    ELSE LET M1 == [M EXCEPT !.link = next]
             back == IF next = "online" /\ M.role # "GM" THEN <<D("gm-back")>> ELSE <<>>
         IN IF next = "online" /\ ~answersOwn /\ M.role # "GM" /\ M1.phase = "live"
            THEN LET E == Enter(c, M1, "gm-return", NoGen) IN Res(E.m, back \o E.d)
            ELSE IF next = "online" /\ ~answersOwn /\ M1.phase \in CatchingUp
                    /\ M1.sent /\ ~M1.seen
                 THEN LET Q == RequestR(c, M1, Own(c, M1))
                      IN Res(Q.m, back \o Q.d \o <<D("show")>>)
                 ELSE Res(M1, back \o <<D("show")>>)

\* enterFromGeneration(generation, keepNonce): catchUpGenerationHeard and
\* catchUpGenerationRead. generation-table.ts seeGeneration and adoptFromCopy
\* compare the generation the same way before they hand it on.
EnterFromGeneration(c, M, g, keepNonce) ==
    LET current == IF M.phase = "adopting" THEN M.target ELSE M.gen
    IN IF g <= current THEN Same(M)
       ELSE IF keepNonce /\ M.phase \in CatchingUp
            THEN Res([M EXCEPT !.phase = "adopting", !.trig = "generation", !.target = g,
                               !.pend = "none"],
                     <<D("adopt")>>)
            ELSE LET E == Enter(c, M, "generation", g) IN Res(E.m, <<D("adopt")>> \o E.d)

\* The save of a complete adoption. catch-up.ts feed: after a `state-merged`
\* or `adoption-staged` event that leaves the phase adopting with
\* pendingAdoption set, options.saveAdoption, then the `adoption-saved` event
\* (catchUpAdoptionSaved). `pend` is pendingAdoption: "copy" (fromCopy),
\* "answer", or "none". `saveOk` is what saveAdoption returns; it also moves
\* the client's own generation (generation-table.ts saveAdoption,
\* storeWritten). A failed save keeps pendingAdoption, so the next
\* `state-merged` or `adoption-staged` saves again.
SavePending(c, M, saveOk) ==
    IF M.phase # "adopting" \/ M.pend = "none" \/ ~saveOk THEN Same(M)
    ELSE LET M1 == [M EXCEPT !.phase = "ordinary", !.gen = M.target, !.target = NoGen,
                             !.pend = "none"]
         IN IF M.pend = "copy" THEN Res(M1, <<Arm(CK)>>)
            ELSE LET L == Leave(c, M1, "answered") IN Res(L.m, <<Arm(CK)>> \o L.d)

\* adoptionStaged(): catchUpAdoptionStaged (adopting only), then the save.
AdoptionStaged(c, M, saveOk) ==
    SavePending(c, IF M.phase = "adopting" THEN [M EXCEPT !.pend = "copy"] ELSE M, saveOk)

\* catchUpRoomCopyRead (the live and initializing rows ignore it). It does not
\* check `r`; for an old `r`, request() sends nothing, and the request timer and
\* party read it arms do nothing later, so Collect drops them.
RoomCopyRead(c, M, n, fresh) ==
    IF M.phase \notin CatchingUp THEN Same(M)
    ELSE LET A == IF fresh \/ ~M.seen THEN Ask(c, M, <<c, n>>) ELSE Same(M)
         IN Res(A.m, A.d \o (IF M.role = "GM" THEN <<ReadParty(<<c, n>>)>> ELSE <<>>))

\* catchUpPartyRead (ordinary only; the other rows ignore it). `ok` FALSE is a
\* failed read: catch-up-effects.ts reports it and calls nothing.
PartyRead(c, M, n, ok, otherGm) ==
    IF ~ok \/ M.phase # "ordinary" \/ M.nonce # n \/ M.role # "GM" THEN Same(M)
    ELSE IF otherGm THEN Same(M) ELSE Leave(c, M, "unanswered")

MarkSeen(c, M, r) ==
    IF M.phase \in CatchingUp /\ Own(c, M) = r THEN [M EXCEPT !.seen = TRUE] ELSE M

\* catchUpStateMerged, for a one-part answer (n = 1).
StateMergedStep(c, M, msg, rel) ==
    LET pre == IF rel = "higher"
               THEN IF M.phase # "adopting" \/ msg.g # M.target THEN "stop"
                    ELSE "go"
               ELSE "go"
        M1 == IF rel = "higher" THEN MarkSeen(c, M, msg.r)
              ELSE MarkSeen(c, [M EXCEPT !.answered = @ \cup {msg.r},
                                         !.armed = @ \ {msg.r}], msg.r)
        d1 == IF rel = "higher" THEN <<>> ELSE <<Disarm(AK(msg.r))>>
    IN IF pre = "stop" THEN Same(M)
       ELSE IF msg.r # <<c, M1.last>> \/ (M1.phase = "adopting" /\ msg.g # M1.target)
            THEN Res(M1, d1)
       ELSE IF M1.phase = "adopting"
            THEN Res([M1 EXCEPT !.pend = "answer"], d1)
       ELSE IF M1.phase = "ordinary"
            THEN LET L == Leave(c, M1, "answered") IN Res(L.m, d1 \o L.d)
       ELSE IF ~M1.gmAnswered
            THEN Res([M1 EXCEPT !.gmAnswered = TRUE], d1 \o <<D("show")>>)
       ELSE Res(M1, d1)

\* stateMerged(message, sender, relation): the step, then the save of a pending adoption.
StateMerged(c, M, msg, rel, saveOk) ==
    LET S == StateMergedStep(c, M, msg, rel)
        V == SavePending(c, S.m, saveOk)
    IN Res(V.m, S.d \o V.d)

\* heard(senderRole, message) for a GM sender
Heard(c, M, msg) ==
    LET W == Watch(M)
        S == SetGmLink(c, W.m, "online", msg.t = "state" /\ msg.r = <<c, M.last>>)
    IN Res(S.m, W.d \o S.d)

\* catchUpStateRequested
StateRequested(M, r) ==
    LET M1 == [M EXCEPT !.answered = @ \ {r}]
    IN IF M1.role = "GM" /\ ~CanAnswer(M1)
       THEN Same([M1 EXCEPT !.held = @ \cup {r}])
       ELSE ScheduleAnswer(M1, r)

\* fired(timer): catchUpFired, and livenessFired for ping and gm-silence.
Fired(c, M, k) ==
    CASE k.kind = "catch-up" ->
            IF M.phase \notin CatchingUp THEN Same(M)
            ELSE IF M.phase = "adopting"
                 THEN Res(M, <<Arm(CK), ReadCopy(Own(c, M), TRUE)>>)
                 ELSE Leave(c, M, "unanswered")
      [] k.kind = "ping" ->
            Res(M, <<D("ping")>> \o (IF Mutated("ping-not-rearmed") THEN <<>> ELSE <<Arm(PK)>>))
      [] k.kind = "gm-silence" -> SetGmLink(c, M, "offline", FALSE)
      [] k.kind = "request" ->
            IF M.phase \in CatchingUp /\ Own(c, M) = k.r THEN RequestR(c, M, k.r) ELSE Same(M)
      [] k.kind = "answer" ->
            LET M1 == [M EXCEPT !.armed = @ \ {k.r}]
                M2 == IF ~CanAnswer(M1) /\ M1.phase = "ordinary"
                      THEN [M1 EXCEPT !.held = @ \cup {k.r}] ELSE M1
            IN IF CanAnswer(M2) /\ k.r \notin M2.answered
               THEN Res([M2 EXCEPT !.answered = @ \cup {k.r}], <<AnswerD(k.r)>>)
               ELSE Same(M2)

\* `r` is the active request of a client that catches up.
ActiveR(c, M, r) == M.phase \in CatchingUp /\ r = Own(c, M)

\* answersOwn(r): `phase.kind === 'catching-up'`, so an adopting client's
\* active `r` does not count (TASK-129). The Mutation "fix-answers-own" is the
\* fix that TASK-129 asks for: it counts in both phases, as before TASK-115.
AnswersOwn(c, M, r) ==
    IF Mutated("fix-answers-own") THEN ActiveR(c, M, r)
    ELSE M.phase = "ordinary" /\ r = Own(c, M)

(***************************************************************************)
(* The engine: catch-up-effects.ts run interprets the decisions           *)
(***************************************************************************)

\* REMOTE broadcast: every other open client, and the importer while present.
Peers(c) == {d \in Clients \ {c} : life[d] = "open"}
            \cup (IF xLife = "present" THEN {"x"} ELSE {})
Bcast(c, t, r, g) == {[from |-> c, to |-> d, t |-> t, r |-> r, g |-> g] : d \in Peers(c)}

Apply1(c, dd, E, g) ==
    CASE dd.type = "arm" ->
            [E EXCEPT !.tm = @ \cup {dd.k}, !.pinged = IF dd.k = SK THEN FALSE ELSE @]
      [] dd.type = "disarm" -> [E EXCEPT !.tm = @ \ {dd.k}]
      [] dd.type = "arm-answers" -> [E EXCEPT !.tm = @ \cup {AK(r) : r \in dd.rs}]
      [] dd.type = "read-room-copy" ->
            [E EXCEPT !.rd = @ \cup {[kind |-> "copy", n |-> dd.r[2], fresh |-> dd.fresh]}]
      [] dd.type = "read-party" ->
            [E EXCEPT !.rd = @ \cup {[kind |-> "party", n |-> dd.r[2], fresh |-> FALSE]}]
      [] dd.type = "request" -> [E EXCEPT !.net = @ \cup Bcast(c, "state-request", dd.r, g)]
      [] dd.type = "answer" ->
            [E EXCEPT !.net = @ \cup Bcast(c, "state", dd.r, g), !.owed = @ \ {dd.r}]
      [] dd.type = "alive" -> [E EXCEPT !.net = @ \cup Bcast(c, "alive", NoR, g)]
      [] dd.type = "ping" ->
            [E EXCEPT !.net = @ \cup Bcast(c, "ping", NoR, g), !.pinged = TRUE]
      [] OTHER -> E  \* entered, caught-up, show, gm-back, adopt: no catch-up state

RECURSIVE ApplyAll(_, _, _, _)
ApplyAll(c, ds, E, g) ==
    IF ds = <<>> THEN E ELSE ApplyAll(c, Tail(ds), Apply1(c, Head(ds), E, g), g)

\* A read or a request timer for an `r` that is no longer the active one does
\* nothing when it ends: roomCopyRead, partyRead and fired('request') check `r`,
\* and ids only grow. The model drops them at once to stay small. The room copy
\* merge such a read also does is FollowCopy, which can run at any time.
\* In the same way, answeredNonces is read only for an `r` with an armed answer
\* timer or a held request: every other way back to them passes stateRequested,
\* which deletes `r` first. So the model forgets the other entries.
Current(M, n) == M.phase \in CatchingUp /\ M.nonce = n
Collect(c, M, tm, rd) ==
    [tm |-> {k \in tm : k.kind = "request" => Current(M, k.r[2])},
     rd |-> {x \in rd : Current(M, x.n)},
     m |-> [M EXCEPT !.answered = {r \in @ : r \in M.held \/ AK(r) \in tm},
                     \* Only ask() and canAnswer() read the trigger, for gm-return and drift.
                     !.trig = IF @ \in {"gm-return", "drift", "none"} THEN @ ELSE "other",
                     \* View flags: no decision reads them beyond a `show`.
                     !.firstDone = FALSE, !.gmAnswered = FALSE]]

\* Commit one step of client c: the module result R, applied over the given
\* starting timers, reads, network and ghost sets.
RunWithD(c, R, tm0, rd0, net0, owed0, dropped0) ==
    LET E == ApplyAll(c, R.d, [tm |-> tm0, rd |-> rd0, net |-> net0,
                               pinged |-> pinged[c], owed |-> owed0], R.m.gen)
        K == Collect(c, R.m, E.tm, E.rd)
        \* Ghosts keep only requests whose asker can still wait for them: an
        \* asker's `r` never comes back once it moved on, as ids only grow.
        new(d) == IF d = c THEN K.m ELSE m[d]
        waits(r) == r[1] \in Clients /\ Current(new(r[1]), r[2])
        owed1 == [d \in Clients |-> {r \in IF d = c THEN E.owed ELSE owed[d] : waits(r)}]
    IN /\ m' = [m EXCEPT ![c] = K.m]
       /\ timers' = [timers EXCEPT ![c] = K.tm]
       /\ reads' = [reads EXCEPT ![c] = K.rd]
       /\ net' = E.net
       /\ pinged' = [pinged EXCEPT ![c] = E.pinged]
       /\ owed' = owed1
       /\ dropped' = [d \in Clients |-> (IF d = c THEN dropped0 ELSE dropped[d]) \cap owed1[d]]

RunWith(c, R, tm0, rd0, net0, owed0) == RunWithD(c, R, tm0, rd0, net0, owed0, dropped[c])

Run(c, R) == RunWith(c, R, timers[c], reads[c], net, owed[c])

Vouches(c) == c \notin Unreadable

InitM(c, ids, g) ==
    [phase |-> "initializing", trig |-> "none", nonce |-> 0, sent |-> FALSE,
     seen |-> FALSE, last |-> 0, target |-> NoGen, link |-> "offline",
     firstDone |-> FALSE, gmAnswered |-> FALSE, held |-> {}, answered |-> {},
     armed |-> {}, gen |-> g, role |-> role[c], vouch |-> Vouches(c), ids |-> ids,
     pend |-> "none"]

SaveOutcomes(c) ==
    IF role[c] = "GM" /\ Vouches(c) /\ SaveCanFail THEN BOOLEAN ELSE {TRUE}

\* room-protocol.ts: a GM that speaks from a higher generation is in the party
\* as a GM; the model has no unknown senders.
SenderRole(msg) == IF msg.from = "x" THEN "GM" ELSE role[msg.from]

Relation(g, own) == IF g > own THEN "higher" ELSE IF g = own THEN "equal" ELSE "lower"

\* room-messages.ts admitRoomMessage, for the message kinds modeled here.
Admit(t, sr, rel) ==
    CASE t = "state" -> sr = "GM" /\ rel \in {"equal", "higher"}
      [] t = "reset" -> sr = "GM" /\ rel = "higher"
      [] t = "alive" -> sr = "GM"
      [] OTHER -> TRUE  \* ping, state-request: any known sender

\* room-protocol.ts dispatchRoomMessage and receiveState
Dispatch(c, M, msg, rel, saveOk) ==
    CASE msg.t = "state-request" -> StateRequested(M, msg.r)
      [] msg.t = "state" ->
            IF rel = "higher"
            THEN IF M.phase = "adopting" /\ M.target = msg.g
                 THEN StateMerged(c, M, msg, rel, saveOk) ELSE Same(M)
            ELSE StateMerged(c, M, msg, rel, saveOk)
      [] msg.t = "ping" ->
            Res(M, IF CanAnswer(M) /\ M.phase = "live" THEN <<D("alive")>> ELSE <<>>)
      [] OTHER -> Same(M)  \* alive (drift left out), reset

\* generation-flow.ts adoptFromCopy (generation-table.ts adoptFromCopy, twice):
\* generationRead, then stage and adoptionStaged when the copy is the
\* generation adopted. engine.ts `adopt` runs both decision lists at once.
AdoptFromCopy(c, M, saveOk) ==
    LET G == EnterFromGeneration(c, M, copyGen, M.phase \in CatchingUp)
    IN IF G.m.phase = "adopting" /\ G.m.target = copyGen
       THEN LET F == AdoptionStaged(c, G.m, saveOk) IN Res(F.m, G.d \o F.d)
       ELSE G

OtherGmInParty(c) ==
    \/ \E d \in Clients \ {c} : life[d] = "open" /\ role[d] = "GM"
    \/ xLife = "present"

AnsweringGm(c) ==
    \/ \E d \in Clients \ {c} : life[d] = "open" /\ CanAnswer(m[d]) /\ m[d].phase = "live"
    \/ xLife = "present"

\* No room message to c and no ping from c is still on its way.
Quiet(c) == ~\E msg \in net : msg.to = c \/ (msg.from = c /\ msg.t = "ping")

\* Real delays the clockless model keeps. watch() arms ping at 1/2..3/4 of
\* gmLinkTimeoutMs and gm-silence at the whole of it, and a reply takes far
\* less than a quarter of it, so in a running page gm-silence fires only after
\* a ping went out and every reply came back. `hidden` stands for a page whose
\* timers stopped for a while (a frozen or suspended tab, a sleeping laptop):
\* when it runs again, every overdue timer fires back to back, before any reply.
TimingOK(c, k) ==
    k = SK => (hidden[c] \/ Mutated("silence-not-after-ping") \/ (pinged[c] /\ Quiet(c)))

(***************************************************************************)
(* Actions                                                                 *)
(***************************************************************************)

Untouched(c) ==
    UNCHANGED <<life, role, hidden, opens, returns, roleChanges, xLife, xGen, copyGen, lastHeard,
                badOffline, ownDropped>>

\* engine.ts startup: enterCatchUp('start') then catchUp.watch(), with no await between.
Open(c) ==
    /\ life[c] \in {"unopened", "closed"}
    /\ opens[c] < MaxOpens
    /\ LET g == IF role[c] = "GM" THEN m[c].gen ELSE 0
           E == Enter(c, InitM(c, m[c].ids, g), "start", NoGen)
           W == Watch(E.m)
       IN RunWith(c, Res(W.m, E.d \o W.d), {}, {}, net, {})
    /\ life' = [life EXCEPT ![c] = "open"]
    /\ hidden' = [hidden EXCEPT ![c] = FALSE]
    /\ opens' = [opens EXCEPT ![c] = @ + 1]
    /\ lastHeard' = [lastHeard EXCEPT ![c] = "none"]
    /\ UNCHANGED <<role, returns, roleChanges, xLife, xGen, copyGen, badOffline, ownDropped>>

\* The page goes away: stop() clears every catch-up timer. closing() runs
\* before it, but whatever it arms is cleared at once. The module is gone, so
\* the model keeps only what a new page starts from: ids and the saved generation.
Close(c) ==
    /\ life[c] = "open"
    /\ life' = [life EXCEPT ![c] = "closed"]
    /\ m' = [m EXCEPT ![c] = InitM(c, m[c].ids, m[c].gen)]
    /\ timers' = [timers EXCEPT ![c] = {}]
    /\ reads' = [reads EXCEPT ![c] = {}]
    /\ owed' = [owed EXCEPT ![c] = {}]
    /\ dropped' = [dropped EXCEPT ![c] = {}]
    /\ hidden' = [hidden EXCEPT ![c] = FALSE]
    /\ pinged' = [pinged EXCEPT ![c] = FALSE]
    /\ lastHeard' = [lastHeard EXCEPT ![c] = "none"]
    /\ UNCHANGED <<role, net, opens, returns, roleChanges, xLife, xGen, copyGen, badOffline,
                   ownDropped>>

\* The page stops running its timers (frozen tab, sleep). engine.ts pageHidden
\* touches only the room copy, so nothing in catch-up changes here; it stays so
\* until the page dies, as a page return need not follow.
PageHidden(c) ==
    /\ c \in HideClients /\ life[c] = "open" /\ ~hidden[c]
    /\ hidden' = [hidden EXCEPT ![c] = TRUE]
    /\ UNCHANGED <<life, role, m, timers, reads, net, opens, returns, roleChanges,
                   xLife, xGen, copyGen, pinged, owed, dropped, lastHeard, badOffline, ownDropped>>

\* engine.ts catchUp(): enterCatchUp('page-return'). The page became visible,
\* resumed or came back online.
PageReturn(c) ==
    /\ life[c] = "open" /\ returns[c] < MaxReturns
    /\ Run(c, Enter(c, m[c], "page-return", NoGen))
    /\ hidden' = [hidden EXCEPT ![c] = FALSE]
    /\ returns' = [returns EXCEPT ![c] = @ + 1]
    /\ UNCHANGED <<life, role, opens, roleChanges, xLife, xGen, copyGen, lastHeard, badOffline,
                   ownDropped>>

\* engine.ts changeRole(next): replicaReplaced, then enterCatchUp('role')
RoleChange(c) ==
    /\ life[c] = "open" /\ roleChanges[c] < MaxRoleChanges
    /\ LET next == IF role[c] = "GM" THEN "PLAYER" ELSE "GM"
       IN /\ role' = [role EXCEPT ![c] = next]
          /\ Run(c, Enter(c, [m[c] EXCEPT !.role = next], "role", NoGen))
    /\ roleChanges' = [roleChanges EXCEPT ![c] = @ + 1]
    /\ UNCHANGED <<life, hidden, opens, returns, xLife, xGen, copyGen, lastHeard, badOffline,
                   ownDropped>>

\* catch-up-effects.ts arm's callback: the key is removed, then fired(timer) runs.
Fire(c, k) ==
    /\ life[c] = "open" /\ k \in timers[c] /\ TimingOK(c, k)
    /\ RunWithD(c, Fired(c, m[c], k), timers[c] \ {k}, reads[c], net, owed[c],
                IF k.kind = "answer" /\ m[c].phase = "adopting"
                THEN dropped[c] \cup {k.r} ELSE dropped[c])
    /\ badOffline' =
          IF k = SK /\ m[c].link = "online" /\ AnsweringGm(c) /\ ~(pinged[c] /\ Quiet(c))
          THEN [badOffline EXCEPT ![c] = IF hidden[c] THEN "hidden" ELSE "visible"]
          ELSE badOffline
    /\ UNCHANGED <<life, role, hidden, opens, returns, roleChanges, xLife, xGen, copyGen, lastHeard,
                   ownDropped>>

\* room-protocol.ts receive, after `await senderOf`: seeGeneration, admission,
\* heard, dispatch. Each ports.runCatchUp in it (catch-up-effects.ts run)
\* interprets its decisions at once, in order.
Receive(msg) ==
    LET c == msg.to
        M == m[c]
        sr == SenderRole(msg)
        rel == Relation(msg.g, M.gen)
        adm == Admit(msg.t, sr, rel)
        G == IF rel = "higher" /\ sr = "GM"
             THEN EnterFromGeneration(c, M, msg.g, msg.t = "state" /\ AnswersOwn(c, M, msg.r))
             ELSE Same(M)
        H == IF adm /\ sr = "GM" THEN Heard(c, G.m, msg) ELSE Same(G.m)
        owed0 == CASE msg.t = "state-request" /\ role[c] = "GM" -> owed[c] \cup {msg.r}
                   [] msg.t = "state" /\ adm /\ rel # "higher" -> owed[c] \ {msg.r}
                   [] OTHER -> owed[c]
    IN /\ \E ok \in SaveOutcomes(c) :
             LET X == IF adm THEN Dispatch(c, H.m, msg, rel, ok) ELSE Same(H.m)
             IN RunWithD(c, Res(X.m, G.d \o H.d \o X.d), timers[c], reads[c],
                         net \ {msg}, owed0,
                         IF msg.t = "state-request" THEN dropped[c] \ {msg.r} ELSE dropped[c])
       /\ lastHeard' = IF adm /\ sr = "GM" /\ Unreadable # {} THEN [lastHeard EXCEPT ![c] = msg.from]
                       ELSE lastHeard
       \* The answer to the active request was dropped for a new request.
       /\ ownDropped' = IF /\ msg.t = "state" /\ sr = "GM" /\ ActiveR(c, M, msg.r)
                           /\ m'[c].phase \in CatchingUp /\ m'[c].nonce # M.nonce
                        THEN [ownDropped EXCEPT ![c] = TRUE] ELSE ownDropped
       /\ UNCHANGED <<life, role, hidden, opens, returns, roleChanges, xLife, xGen, copyGen,
                      badOffline>>

Deliver(msg) ==
    /\ msg \in net
    /\ msg.to \in Clients
    /\ life[msg.to] = "open"
    /\ Receive(msg)

\* A message to a page that is gone, or to the importer after it left.
Drop(msg) ==
    /\ msg \in net
    /\ IF msg.to = "x" THEN xLife # "present" ELSE life[msg.to] # "open"
    /\ net' = net \ {msg}
    /\ UNCHANGED <<life, role, hidden, m, timers, reads, opens, returns, roleChanges,
                   xLife, xGen, copyGen, pinged, owed, dropped, lastHeard, badOffline, ownDropped>>

\* catch-up-effects.ts 'read-room-copy': roomCopy.read() merges the copy
\* (room-copy.ts mergeReadRoomCopy adopts a higher generation), then
\* catchUp.roomCopyRead(r, fresh). A read may never end.
CopyReadDone(c, rd) ==
    /\ life[c] = "open" /\ rd \in reads[c] /\ rd.kind = "copy"
    /\ \E ok \in SaveOutcomes(c) :
          LET A == IF copyGen > m[c].gen THEN AdoptFromCopy(c, m[c], ok) ELSE Same(m[c])
              B == RoomCopyRead(c, A.m, rd.n, rd.fresh)
          IN RunWith(c, Res(B.m, A.d \o B.d), timers[c], reads[c] \ {rd}, net, owed[c])
    /\ Untouched(c)

\* catch-up-effects.ts 'read-party': platform.party.getPlayers(), then catchUp.partyRead.
PartyReadDone(c, rd) ==
    /\ life[c] = "open" /\ rd \in reads[c] /\ rd.kind = "party"
    /\ \E ok \in BOOLEAN :
          RunWith(c, PartyRead(c, m[c], rd.n, ok, OtherGmInParty(c)),
                  timers[c], reads[c] \ {rd}, net, owed[c])
    /\ Untouched(c)

\* room-copy.ts followMetadata, or the write loop's read-back (room-copy-table.ts
\* adoptForOrdinary): a copy of a higher generation is adopted at any time.
FollowCopy(c) ==
    /\ life[c] = "open" /\ copyGen > m[c].gen
    /\ \E ok \in SaveOutcomes(c) : Run(c, AdoptFromCopy(c, m[c], ok))
    /\ Untouched(c)

XBcastG(t, r, g) == {[from |-> "x", to |-> d, t |-> t, r |-> r, g |-> g] :
                        d \in {d \in Clients : life[d] = "open"}}
XBcast(t, r) == XBcastG(t, r, xGen)

\* The importer writes the room copy before its `reset`; the copy may not fit.
\* A second import (or a wipe) by the same GM client takes the next generation.
XImport ==
    /\ xGen < Imports /\ xLife # "gone"
    /\ xGen' = xGen + 1
    /\ \E fits \in BOOLEAN : copyGen' = IF fits THEN xGen + 1 ELSE copyGen
    /\ xLife' = "present"
    /\ net' = net \cup XBcastG("reset", NoR, xGen + 1)
    /\ UNCHANGED <<life, role, hidden, m, timers, reads, opens, returns, roleChanges,
                   pinged, owed, dropped, lastHeard, badOffline, ownDropped>>

\* The importer is a live, vouching GM: it answers requests and pings on receipt.
XReceive(msg) ==
    /\ msg \in net /\ msg.to = "x" /\ xLife = "present"
    /\ net' = (net \ {msg})
              \cup (CASE msg.t = "state-request" -> XBcast("state", msg.r)
                      [] msg.t = "ping" -> XBcast("alive", NoR)
                      [] OTHER -> {})
    /\ UNCHANGED <<life, role, hidden, m, timers, reads, opens, returns, roleChanges,
                   xLife, xGen, copyGen, pinged, owed, dropped, lastHeard, badOffline, ownDropped>>

XLeave ==
    /\ xLife = "present"
    /\ xLife' = "gone"
    /\ UNCHANGED <<life, role, hidden, m, timers, reads, net, opens, returns, roleChanges,
                   xGen, copyGen, pinged, owed, dropped, lastHeard, badOffline, ownDropped>>

Init ==
    /\ life = [c \in Clients |-> "unopened"]
    /\ role = InitialRole
    /\ hidden = [c \in Clients |-> FALSE]
    /\ m = [c \in Clients |-> [phase |-> "initializing", trig |-> "none", nonce |-> 0,
                               sent |-> FALSE, seen |-> FALSE, last |-> 0, target |-> NoGen,
                               link |-> "offline", firstDone |-> FALSE, gmAnswered |-> FALSE,
                               held |-> {}, answered |-> {}, armed |-> {}, gen |-> 0,
                               role |-> InitialRole[c], vouch |-> Vouches(c), ids |-> 0,
                               pend |-> "none"]]
    /\ timers = [c \in Clients |-> {}]
    /\ reads = [c \in Clients |-> {}]
    /\ net = {}
    /\ opens = [c \in Clients |-> 0]
    /\ returns = [c \in Clients |-> 0]
    /\ roleChanges = [c \in Clients |-> 0]
    /\ xLife = "none"
    /\ xGen = 0
    /\ copyGen = 0
    /\ pinged = [c \in Clients |-> FALSE]
    /\ owed = [c \in Clients |-> {}]
    /\ dropped = [c \in Clients |-> {}]
    /\ lastHeard = [c \in Clients |-> "none"]
    /\ badOffline = [c \in Clients |-> "no"]
    /\ ownDropped = [c \in Clients |-> FALSE]

\* Every timer key and read a client can hold, so that each disjunct of Next is
\* one quantifier over one action and TLC names the action in its traces.
Rs == (Clients \cup {"x"}) \X (1..MaxIds)
AllKeys == {CK, PK, SK} \cup {RK(r) : r \in Rs} \cup {AK(r) : r \in Rs}
AllReads == [kind : {"copy"}, n : 1..MaxIds, fresh : BOOLEAN]
            \cup [kind : {"party"}, n : 1..MaxIds, fresh : {FALSE}]

\* A quantifier over `net` inside Next makes TLC name the step "Next"; these keep the name.
DeliverAny == \E msg \in net : Deliver(msg)
DropAny == \E msg \in net : Drop(msg)
XReceiveAny == \E msg \in net : XReceive(msg)

Next ==
    \/ \E c \in Clients : Open(c)
    \/ \E c \in Clients : Close(c)
    \/ \E c \in Clients : PageHidden(c)
    \/ \E c \in Clients : PageReturn(c)
    \/ \E c \in Clients : RoleChange(c)
    \/ \E c \in Clients : FollowCopy(c)
    \/ \E c \in Clients, k \in AllKeys : Fire(c, k)
    \/ \E c \in Clients, rd \in AllReads : CopyReadDone(c, rd)
    \/ \E c \in Clients, rd \in AllReads : PartyReadDone(c, rd)
    \/ DeliverAny
    \/ DropAny
    \/ XReceiveAny
    \/ XImport
    \/ XLeave

Spec == Init /\ [][Next]_vars

\* newId() calls are bounded; TLC does not explore past MaxIds.
Bounds ==
    /\ \A c \in Clients : m[c].ids <= MaxIds
    /\ Cardinality(net) <= MaxInFlight

(***************************************************************************)
(* Invariants                                                              *)
(***************************************************************************)

Open_(c) == life[c] = "open"

\* A client that catches up always has its catch-up timeout armed, so the
\* timeout ends an ordinary catch-up and retries an adoption.
TimeoutArmed ==
    \A c \in Clients : Open_(c) /\ m[c].phase \in CatchingUp => CK \in timers[c]

\* A client that shows a GM online has gm-silence armed, so a GM that left
\* shows offline within gmLinkTimeoutMs.
SilenceArmed ==
    \A c \in Clients : Open_(c) /\ m[c].link = "online" => SK \in timers[c]

\* An open client always has its ping armed, so a silent GM that answers is
\* found again.
PingArmed ==
    \A c \in Clients : Open_(c) => PK \in timers[c]

\* A visible client marks the GM link offline only after it pinged and every
\* GM reply came back.
NoPrematureOfflineVisible == \A c \in Clients : badOffline[c] # "visible"

\* The same, for a hidden client too.
NoPrematureOffline == \A c \in Clients : badOffline[c] = "no"

AskerWaits(r, c) ==
    /\ r[1] \in Clients
    /\ Open_(r[1])
    /\ m[r[1]].phase = "ordinary"
    /\ m[r[1]].nonce = r[2]
    /\ m[r[1]].gen = m[c].gen

\* A GM client that can answer keeps every request it heard and that its
\* asker still waits for: an answer timer is armed or the request is held.
AnswerKept ==
    \A c \in Clients :
        Open_(c) /\ CanAnswer(m[c]) =>
            \A r \in owed[c] \ dropped[c] :
                AskerWaits(r, c) => AK(r) \in timers[c] \/ r \in m[c].held

\* The rest of AnswerKept: a request is not lost because its answer timer
\* fired while the GM adopted a generation (catch-up.ts fired 'answer').
NoAnswerDroppedInAdoption ==
    \A c \in Clients :
        Open_(c) /\ CanAnswer(m[c]) => \A r \in owed[c] \cap dropped[c] : ~AskerWaits(r, c)

\* A client that adopts a generation can still get it: the room copy holds
\* it, or a GM client of that generation is in the room.
AdoptionCanComplete ==
    \A c \in Clients :
        Open_(c) /\ m[c].phase = "adopting" =>
            \/ copyGen >= m[c].target
            \/ xLife = "present"
            \/ \E d \in Clients : Open_(d) /\ role[d] = "GM" /\ Vouches(d) /\ m[d].gen = m[c].target

\* A `state` that answers a client's active request keeps that request: the
\* client does not drop it for a new `r` and ask again. room-protocol.ts
\* handleRoomMessage: "An answer to this client's own request keeps that
\* request." (the keepNonce it passes to seeGeneration).
OwnAnswerKeepsRequest == \A c \in Clients : ~ownDropped[c]

\* A client shows a GM online only while the GM that kept it online can
\* answer: not a GM client whose saved records cannot be read.
OnlineGmAnswers ==
    \A c \in Clients :
        Open_(c) /\ m[c].link = "online" /\ lastHeard[c] \in Clients =>
            ~(Open_(lastHeard[c]) /\ role[lastHeard[c]] = "GM" /\ lastHeard[c] \in Unreadable)

=============================================================================
