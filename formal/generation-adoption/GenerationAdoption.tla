------------------------- MODULE GenerationAdoption -------------------------
(***************************************************************************)
(* AD-9 generation and adoption in Muster Roll, as the code runs it.       *)
(*                                                                         *)
(* A generation is a full replacement of a room's data: a snapshot import  *)
(* or a wipe. The importing GM client mints it, saves it, writes the room  *)
(* copy, then sends `reset`. Every other client that hears a higher        *)
(* generation from a GM adopts it: it stages that generation's records     *)
(* apart from its replica and, once a GM answer or the room copy completes *)
(* it, saves it (a GM client) and replaces its replica.                    *)
(*                                                                         *)
(* One step of this model is one synchronous run of JavaScript between     *)
(* two awaits in the real code. The code map is in                         *)
(* .claude/skills/generation-adoption/SKILL.md.                            *)
(*                                                                         *)
(* Records are abstracted to the generation they belong to: a replica,     *)
(* a staged set, a message or the room copy holds a set of generation      *)
(* tags. A set of more than one tag, or a tag that is not the holder's own *)
(* generation, is a mix of two generations.                                *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
  Clients,          \* connection ids, e.g. {"a", "b"}
  PlayersAtStart,   \* clients that start as players (no persistence)
  MaxImports,       \* snapshot imports and wipes started in the whole run
  MaxRoleChanges,   \* role changes in the whole run
  MaxCloses,        \* pages that close in the whole run
  MaxStoreFails,    \* failed generation saves (localStorage) in the whole run
  MaxCopyFails,     \* failed import room-copy writes in the whole run
  Bug               \* "none" is the code; any other value is a broken variant

NONE == -1

(* The connection ids' order, which breaks a tie between two generations of *)
(* one n. Any fixed order of the clients will do.                           *)
Idx == CHOOSE f \in [Clients -> 1..Cardinality(Clients)] :
         \A x, y \in Clients : x # y => f[x] # f[y]

(* A generation {n, a} as one number: n * 10 + Idx[a]. INITIAL_GENERATION   *)
(* {n: 0, a: ""} is 0. Integer order is compareGenerations' order.          *)
NextGeneration(r, c) == 10 * ((IF r.own > r.seen THEN r.own ELSE r.seen) \div 10 + 1) + Idx[c]

Max2(x, y) == IF x >= y THEN x ELSE y
MaxOf(S) == IF S = {} THEN NONE ELSE CHOOSE x \in S : \A y \in S : y <= x

NoCopy == [g |-> NONE, tags |-> {}]

VARIABLES
  cl,          \* per client: what generation-flow, catch-up and the engine hold
  inbox,       \* per receiver: room messages in arrival order
  copy,        \* the room copy in room metadata
  imports, roleChanges, closes, storeFails, copyFails,
  hi           \* ghost: the highest complete generation each client's storage ever held

vars == <<cl, inbox, copy, imports, roleChanges, closes, storeFails, copyFails, hi>>

GmAtStart == [role |-> "GM", open |-> TRUE, own |-> 0, seen |-> 0, persist |-> 0,
              complete |-> {0}, replica |-> {0}, staged |-> {},
              phase |-> "live", target |-> NONE, pending |-> "none",
              importing |-> FALSE, impGen |-> NONE, impStage |-> "none",
              persistAll |-> FALSE]

PlayerAtStart == [GmAtStart EXCEPT !.role = "PLAYER", !.persist = NONE, !.complete = {}]

Init ==
  /\ cl = [c \in Clients |-> IF c \in PlayersAtStart THEN PlayerAtStart ELSE GmAtStart]
  /\ inbox = [c \in Clients |-> << >>]
  /\ copy = [g |-> 0, tags |-> {0}]
  /\ imports = 0 /\ roleChanges = 0 /\ closes = 0 /\ storeFails = 0 /\ copyFails = 0
  /\ hi = [c \in Clients |-> MaxOf(cl[c].complete)]

UpdateHi == hi' = [c \in Clients |-> Max2(hi[c], MaxOf(cl'[c].complete))]

(* Room messages. A receiver keeps one copy of an identical message.        *)
Msg(from, t, g, tags) == [from |-> from, t |-> t, g |-> g, tags |-> tags]
Push(q, m) == IF \E i \in 1..Len(q) : q[i] = m THEN q ELSE Append(q, m)
Broadcast(inb, c, m) ==
  [d \in Clients |-> IF d # c /\ cl[d].open THEN Push(inb[d], m) ELSE inb[d]]
Reaches(c, m) == \E d \in Clients : d # c /\ cl[d].open /\ ~\E i \in 1..Len(inbox[d]) : inbox[d][i] = m

(* A save outcome: a save can fail only on a client with persistence.       *)
SaveOutcomes(r, saves) ==
  IF saves /\ r.persist # NONE /\ storeFails < MaxStoreFails THEN BOOLEAN ELSE {TRUE}
CountFail(ok) == storeFails' = storeFails + (IF ok THEN 0 ELSE 1)

-----------------------------------------------------------------------------
(* Pure updates of one client's record, each mapped to one code function.   *)

(* catch-up-table.ts enterFromGeneration, reached by generation-table.ts    *)
(* seeGeneration / adoptFromCopy; the `adopt` decision runs clearStaged.    *)
(* A new target drops a pending adoption whose save failed.                 *)
SeeGeneration(r, g) ==
  LET base == IF r.target = NONE THEN r.own ELSE r.target
      heard == [r EXCEPT !.seen = Max2(r.seen, g)]
  IN IF g > base /\ (Bug # "no-retarget" \/ r.target = NONE)
       THEN [heard EXCEPT !.phase = "adopting", !.target = g, !.pending = "none",
                          !.staged = IF Bug = "keep-staged" THEN r.staged ELSE {}]
       ELSE heard

(* catch-up-table.ts leave + engine.ts performCaughtUp (AD-11 persist-all). *)
Leave(r) ==
  [r EXCEPT !.phase = "live", !.persistAll = FALSE,
            !.complete = IF r.persistAll /\ r.persist # NONE /\ Bug # "exit-skips-persist-all"
                           THEN r.complete \cup {r.persist} ELSE r.complete]

(* catch-up.ts feed with a pending adoption -> generation-flow.ts           *)
(* saveAdoption; catch-up-table.ts catchUpAdoptionSaved. A failed save     *)
(* keeps the adoption pending, so the next `state` the client merges        *)
(* retries the save with the same `fromCopy`.                               *)
SaveAdoption(r, fromCopy, ok) ==
  LET T == r.target
      saved == IF r.persist = NONE THEN r
               ELSE [r EXCEPT !.complete = {g \in r.complete \cup {T} : g >= T},
                              !.persist = IF Bug = "save-keeps-persistence" THEN r.persist ELSE T]
      done == [saved EXCEPT !.staged = IF Bug = "save-keeps-staged" THEN r.staged ELSE {},
                            !.own = T, !.seen = Max2(r.seen, T),
                            !.replica = r.staged, !.phase = "catching", !.target = NONE,
                            !.pending = "none"]
  IN IF r.persist # NONE /\ ~ok
       THEN [r EXCEPT !.complete =
               (IF Bug = "remove-old-on-fail" THEN {g \in r.complete : g >= T}
                ELSE r.complete) \ {T},
                      !.replica = IF Bug = "replace-on-failed-save" THEN r.staged ELSE r.replica,
                      !.pending = IF fromCopy THEN "copy" ELSE "answer"]
       ELSE IF fromCopy THEN done ELSE Leave(done)

(* room-copy.ts mergeReadRoomCopy with generation-flow.ts adoptFromCopy.    *)
ReadCopyInto(r, ok) ==
  LET adopting == IF copy.g > r.own THEN SeeGeneration(r, copy.g) ELSE r
      saving == copy.g > r.own /\ adopting.target = copy.g
      staged == [adopting EXCEPT !.staged = @ \cup copy.tags]
      after == IF saving THEN SaveAdoption(staged, TRUE, ok) ELSE adopting
  IN IF after.own = copy.g THEN [after EXCEPT !.replica = @ \cup copy.tags] ELSE after

CopySaves(r) == copy.g > r.own /\ SeeGeneration(r, copy.g).target = copy.g

(* generation-table.ts importSuperseded, with `aborted` false.             *)
Superseded(r) == r.target # NONE \/ r.own # r.impGen

-----------------------------------------------------------------------------
(* Actions. Each is one synchronous run of code between two awaits.         *)

(* GM imports a snapshot or wipes: command-routing.ts decideCommandRoute,   *)
(* then generation-table.ts importGeneration, whose effects generation-     *)
(* flow.ts run applies up to `await ports.roomCopy.writeImport`.            *)
Import(c) ==
  LET r == cl[c]
      G == NextGeneration(r, c)
  IN /\ r.open /\ r.role = "GM" /\ r.persist # NONE /\ r.phase = "live" /\ ~r.importing
     /\ imports < MaxImports
     /\ imports' = imports + 1
     /\ \E ok \in SaveOutcomes(r, TRUE) :
          /\ CountFail(ok)
          /\ cl' = [cl EXCEPT ![c] =
                IF ok
                  THEN [r EXCEPT !.complete = @ \cup {G}, !.importing = TRUE, !.impGen = G,
                                 !.impStage = "copying", !.persist = G, !.own = G,
                                 !.seen = Max2(r.seen, G), !.replica = {G}]
                  ELSE [r EXCEPT !.complete = @ \ {G}]]
     /\ UNCHANGED <<inbox, copy, roleChanges, closes, copyFails>>
     /\ UpdateHi

(* room-copy.ts writeImport -> room-copy-table.ts importRead, encodeWrite,  *)
(* verifyDone, importRejected, cleanupRead: the whole import copy write.    *)
ImportCopyWritten(c) ==
  LET r == cl[c]
  IN /\ r.open /\ r.importing /\ r.impStage = "copying"
     /\ UNCHANGED <<inbox, imports, roleChanges, closes>>
     /\ CASE Superseded(r) /\ Bug # "copy-ignores-superseded" ->
               /\ cl' = [cl EXCEPT ![c].impStage = "finishing"]
               /\ UNCHANGED <<copy, storeFails, copyFails>>
          [] copy.g > r.impGen ->
               \E ok \in SaveOutcomes(r, CopySaves(r)) :
                 /\ CountFail(ok)
                 /\ cl' = [cl EXCEPT ![c] = [ReadCopyInto(r, ok) EXCEPT !.impStage = "finishing"]]
                 /\ UNCHANGED <<copy, copyFails>>
          [] OTHER ->
               \E written \in (IF copyFails < MaxCopyFails THEN BOOLEAN ELSE {TRUE}) :
                 /\ cl' = [cl EXCEPT ![c].impStage = "finishing"]
                 /\ copy' = IF written THEN [g |-> r.impGen, tags |-> r.replica]
                            ELSE IF copy.g # NONE /\ copy.g < r.impGen THEN NoCopy ELSE copy
                 /\ copyFails' = copyFails + (IF written THEN 0 ELSE 1)
                 /\ UNCHANGED storeFails
     /\ UpdateHi

(* generation-flow.ts writeImport after its await -> generation-table.ts    *)
(* copyWritten (`written`, then `finished`).                                *)
ImportFinished(c) ==
  LET r == cl[c]
  IN /\ r.open /\ r.importing /\ r.impStage = "finishing"
     /\ IF Superseded(r)
          THEN /\ cl' = [cl EXCEPT ![c] = [r EXCEPT !.importing = FALSE, !.impGen = NONE,
                                                    !.impStage = "none"]]
               /\ UNCHANGED inbox
          ELSE /\ cl' = [cl EXCEPT ![c] = [r EXCEPT !.importing = FALSE, !.impGen = NONE,
                                                    !.impStage = "none",
                                                    !.complete = {g \in @ : g >= r.impGen}]]
               /\ inbox' = Broadcast(inbox, c, Msg(c, "reset", r.impGen, {}))
     /\ UNCHANGED <<copy, imports, roleChanges, closes, storeFails, copyFails>>
     /\ UpdateHi

(* room-protocol.ts handleRoomMessage, dispatchRoomMessage, receiveState;   *)
(* catch-up-table.ts catchUpStateMerged / catchUpStateRequested; catch-up.ts *)
(* feed saves a pending adoption after any `state-merged`.                  *)
Deliver(c) ==
  LET r == cl[c]
      m == Head(inbox[c])
      sender == IF cl[m.from].open THEN cl[m.from].role ELSE "NONE"
      higher == m.g > r.own
      equal == m.g = r.own
      heard == IF higher /\ sender = "GM" THEN SeeGeneration(r, m.g) ELSE r
      stages == m.t = "state" /\ sender = "GM" /\ higher /\ heard.target # NONE
                /\ (Bug = "stage-any-higher" \/ heard.target = m.g)
      merges == m.t = "state" /\ sender = "GM" /\ equal
      (* A `state` of the client's own generation while a failed adoption    *)
      (* save is pending: feed saves the adoption again.                     *)
      retries == merges /\ heard.phase = "adopting" /\ heard.pending # "none"
      (* A `state` of the target completes the adoption as an answer, or,   *)
      (* with a copy adoption pending, retries it as a copy save.           *)
      FromCopy == IF heard.pending = "copy" THEN BOOLEAN ELSE {FALSE}
      answers == m.t = "request" /\ sender # "NONE" /\ heard.role = "GM"
                 /\ heard.persist # NONE /\ heard.phase = "live"
  IN /\ r.open /\ inbox[c] # << >>
     /\ \E ok \in SaveOutcomes(r, stages \/ retries), fromCopy \in FromCopy :
          /\ CountFail(ok)
          /\ cl' = [cl EXCEPT ![c] =
                CASE stages -> SaveAdoption([heard EXCEPT !.staged = @ \cup m.tags], fromCopy, ok)
                  [] merges ->
                       LET merged == [heard EXCEPT !.replica = @ \cup m.tags]
                           retried == IF Bug = "retry-stages-equal"
                                        THEN [merged EXCEPT !.staged = @ \cup m.tags] ELSE merged
                       IN IF retries THEN SaveAdoption(retried, heard.pending = "copy", ok)
                          ELSE IF merged.phase = "catching" THEN Leave(merged) ELSE merged
                  [] OTHER -> heard]
     /\ LET rest == [inbox EXCEPT ![c] = Tail(@)]
        IN inbox' = IF answers
                      THEN Broadcast(rest, c, Msg(c, "state", heard.own, heard.replica))
                      ELSE rest
     /\ UNCHANGED <<copy, imports, roleChanges, closes, copyFails>>
     /\ UpdateHi

(* room-copy.ts read / followed -> room-copy-table.ts observeRead, the read *)
(* a catch-up entry or retry starts, and the metadata subscription.         *)
ReadCopy(c) ==
  LET r == cl[c]
  IN /\ r.open /\ copy.g # NONE /\ copy.g >= r.own
     /\ \E ok \in SaveOutcomes(r, CopySaves(r)) :
          /\ ReadCopyInto(r, ok) # r
          /\ CountFail(ok)
          /\ cl' = [cl EXCEPT ![c] = ReadCopyInto(r, ok)]
     /\ UNCHANGED <<inbox, copy, imports, roleChanges, closes, copyFails>>
     /\ UpdateHi

(* room-copy-table.ts trigger / readDone / encodeWrite / verifyDone: a live *)
(* GM's routine AD-8 write.                                                 *)
WriteCopy(c) ==
  LET r == cl[c]
      merged == IF copy.g = r.own THEN [r EXCEPT !.replica = @ \cup copy.tags] ELSE r
  IN /\ r.open /\ r.role = "GM" /\ r.persist # NONE /\ r.phase = "live" /\ ~r.importing
     /\ copy.g <= r.own
     /\ copy' = [g |-> r.own, tags |-> merged.replica]
     /\ copy' # copy \/ merged # r
     /\ cl' = [cl EXCEPT ![c] = merged]
     /\ UNCHANGED <<inbox, imports, roleChanges, closes, storeFails, copyFails>>
     /\ UpdateHi

(* catch-up-table.ts request / catchUpFired('catch-up') while adopting: a  *)
(* client in catch-up asks the room for state.                              *)
Ask(c) ==
  LET r == cl[c]
      m == Msg(c, "request", r.own, {})
  IN /\ r.open /\ r.phase \in {"catching", "adopting"}
     /\ Reaches(c, m)
     /\ inbox' = Broadcast(inbox, c, m)
     /\ UNCHANGED <<cl, copy, imports, roleChanges, closes, storeFails, copyFails, hi>>

(* catch-up-table.ts catchUpPing: a live GM answers a ping with `alive`.   *)
SpeakAlive(c) ==
  LET r == cl[c]
      m == Msg(c, "alive", r.own, {})
  IN /\ r.open /\ r.role = "GM" /\ r.persist # NONE /\ r.phase = "live"
     /\ Reaches(c, m)
     /\ inbox' = Broadcast(inbox, c, m)
     /\ UNCHANGED <<cl, copy, imports, roleChanges, closes, storeFails, copyFails, hi>>

(* catch-up-table.ts catchUpFired('catch-up') in ordinary catch-up, or      *)
(* catchUpPartyRead alone.                                                  *)
Timeout(c) ==
  /\ cl[c].open /\ cl[c].phase = "catching"
  /\ cl' = [cl EXCEPT ![c] = Leave(@)]
  /\ UNCHANGED <<inbox, copy, imports, roleChanges, closes, storeFails, copyFails>>
  /\ UpdateHi

(* engine.ts changeRole -> generation-flow.ts roleChanged; catch-up enter('role'), *)
(* which drops a pending adoption.                                          *)
RoleChange(c) ==
  LET r == cl[c]
      stored == IF r.complete = {} THEN 0 ELSE MaxOf(r.complete)
      gen == Max2(r.own, stored)
      phase == IF r.phase = "adopting" THEN "adopting" ELSE "catching"
  IN /\ r.open /\ roleChanges < MaxRoleChanges
     /\ roleChanges' = roleChanges + 1
     /\ cl' = [cl EXCEPT ![c] =
           IF r.role = "GM"
             THEN [r EXCEPT !.role = "PLAYER", !.persist = NONE, !.persistAll = FALSE,
                            !.phase = phase, !.pending = "none"]
             ELSE [r EXCEPT !.role = "GM", !.persist = gen, !.own = gen,
                            !.seen = Max2(r.seen, gen), !.persistAll = TRUE, !.phase = phase,
                            !.pending = "none"]]
     /\ UNCHANGED <<inbox, copy, imports, closes, storeFails, copyFails>>
     /\ UpdateHi

(* engine.ts stop: the page closes; other clients drop its later messages.  *)
Close(c) ==
  /\ cl[c].open /\ closes < MaxCloses
  /\ closes' = closes + 1
  /\ cl' = [cl EXCEPT ![c].open = FALSE]
  /\ inbox' = [inbox EXCEPT ![c] = << >>]
  /\ UNCHANGED <<copy, imports, roleChanges, storeFails, copyFails, hi>>

Next ==
  \E c \in Clients :
    \/ Import(c) \/ ImportCopyWritten(c) \/ ImportFinished(c)
    \/ Deliver(c) \/ ReadCopy(c) \/ WriteCopy(c)
    \/ Ask(c) \/ SpeakAlive(c) \/ Timeout(c)
    \/ RoleChange(c) \/ Close(c)

(* The room and the browser do their part: a message on its way arrives, a   *)
(* catch-up timer fires, a copy read ends, an import's room-copy write ends. *)
(* A GM's choices (import, role, close, edits, pings) are not forced.        *)
Fairness ==
  \A c \in Clients :
    /\ WF_vars(Deliver(c)) /\ WF_vars(ReadCopy(c)) /\ WF_vars(Ask(c))
    /\ WF_vars(Timeout(c)) /\ WF_vars(ImportCopyWritten(c)) /\ WF_vars(ImportFinished(c))

Spec == Init /\ [][Next]_vars /\ Fairness

-----------------------------------------------------------------------------
(* Rules. The skill gives each one's plain sentence and harm.                *)

TypeOK ==
  /\ \A c \in Clients :
       /\ cl[c].role \in {"GM", "PLAYER"}
       /\ cl[c].phase \in {"live", "catching", "adopting"}
       /\ cl[c].impStage \in {"none", "copying", "finishing"}
       /\ cl[c].pending \in {"none", "copy", "answer"}
  /\ imports <= MaxImports /\ storeFails <= MaxStoreFails /\ copyFails <= MaxCopyFails

(* The replica holds records of the client's own generation only.           *)
ReplicaOneGeneration == \A c \in Clients : cl[c].replica \subseteq {cl[c].own}

(* Staged records belong to the generation being adopted, and none are      *)
(* staged when nothing is adopted.                                          *)
StagedIsTarget == \A c \in Clients : cl[c].staged \subseteq {cl[c].target}

(* The room copy holds records of the generation it is labeled with.         *)
CopyOneGeneration == copy.tags \subseteq {copy.g}

(* A client whose highest heard generation is above its own is adopting     *)
(* exactly that generation.                                                 *)
NotBehindUnlessAdopting ==
  \A c \in Clients :
    cl[c].open /\ cl[c].seen > cl[c].own =>
      cl[c].phase = "adopting" /\ cl[c].target = cl[c].seen

(* A GM client writes its records under its own generation.                 *)
PersistIsOwn == \A c \in Clients : cl[c].persist \in {NONE, cl[c].own}

(* A client's storage never loses its highest complete generation.          *)
NoStoreRegress == \A c \in Clients : hi[c] = NONE \/ hi[c] \in cl[c].complete

(* The generation a GM client writes under is saved complete in storage,     *)
(* except right after a promotion, whose catch-up exit writes it.           *)
WorkingGenerationSaved ==
  \A c \in Clients :
    cl[c].persist # NONE /\ ~cl[c].persistAll => cl[c].persist \in cl[c].complete

Settled == \A c \in Clients : cl[c].open => cl[c].phase = "live" /\ ~cl[c].importing
Agreed == \A c, d \in Clients : cl[c].open /\ cl[d].open => cl[c].own = cl[d].own

(* Liveness: every open client leaves adoption and import for good.          *)
EventuallySettled == <>[]Settled
(* Liveness: the open clients end on one generation.                         *)
EventuallyAgreed == <>[]Agreed
=============================================================================
