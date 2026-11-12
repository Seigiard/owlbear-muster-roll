import { createBoundedIdSet } from '@/core/bounded-id-set';
import { compareGenerations } from '@/core/merge';
import type { AliveMessage, GenerationRelation, StateMessage } from '@/core/room-messages';
import { type Generation } from '@/core/storage-key';
import type { GmLink, SyncState } from '@/core/ui-messages';
import type { PlayerRole } from '@/core/visibility';

// Far more catch-up nonces than a room sends while one answer is on its way.
const RECENT_NONCE_LIMIT = 256;

// AD-7: this many `alive` in a row from one GM client with a digest unlike this client's own start
// a catch-up. One alone can be a commit still on its way.
const DRIFT_ALIVE_COUNT = 2;

// `page-return`: the page became visible, resumed or came back online. `gm-return`: a player heard
// a GM-origin message after `gmLink` was offline, while live (Story 2.6).
type CatchUpTrigger = 'start' | 'page-return' | 'role' | 'generation' | 'drift' | 'gm-return';

// How a catch-up ended: with all parts of one answer, or with none (timeout, alone, closing page).
type CatchUpExit = 'answered' | 'unanswered';

export type CatchUpTimer =
  | { kind: 'catch-up' }
  | { kind: 'ping' }
  | { kind: 'gm-silence' }
  | { kind: 'request'; r: string }
  | { kind: 'answer'; r: string };

export type CatchUpDecision =
  | { type: 'arm'; timer: CatchUpTimer; delayMs: number }
  | { type: 'disarm'; timer: CatchUpTimer }
  | { type: 'entered'; trigger: CatchUpTrigger; fresh: boolean }
  | { type: 'read-room-copy'; r: string; fresh: boolean }
  | { type: 'read-party'; r: string }
  | { type: 'request'; r: string }
  | { type: 'answer'; r: string }
  | { type: 'alive' }
  | { type: 'ping' }
  | { type: 'caught-up'; exit: CatchUpExit }
  | { type: 'show'; projectedOnly: boolean }
  | { type: 'gm-back' }
  | {
      type: 'adopt';
      generation: Generation;
      previous: Generation | null;
      // `keepNonce`: the message that shows it answers this client's current request, so the catch-up
      // in progress keeps its `r` and takes that answer.
      keepNonce: boolean;
      hadData: boolean;
    };

// The module's catch-up state and GM link. Windows get it with the engine's role.
export type CatchUpView = Omit<SyncState, 'role'>;

export type CatchUpOptions = {
  timing: Pick<
    CatchUpTiming,
    | 'catchUpTimeoutMs'
    | 'stateAnswerDelayMinMs'
    | 'stateAnswerDelayMaxMs'
    | 'gmLinkTimeoutMs'
    | 'incompleteRequestStartMs'
    | 'incompleteRequestMaxMs'
  >;
  random: () => number;
  newId: () => string;
  now: () => number;
  role: () => PlayerRole;
  vouches: () => boolean;
  generation: () => Generation;
  digest: () => number;
  commitsUnsent: () => boolean;
  hasData: () => boolean;
  // Called synchronously inside a catch-up event. Saves and swaps the replica; false keeps adoption
  // open. It never calls back into the module.
  saveAdoption: (generation: Generation, fromCopy: boolean) => boolean;
};

export type CatchUpTiming = {
  readonly catchUpTimeoutMs: number;
  readonly stateAnswerDelayMinMs: number;
  readonly stateAnswerDelayMaxMs: number;
  readonly gmLinkTimeoutMs: number;
  readonly incompleteRequestStartMs: number;
  readonly incompleteRequestMaxMs: number;
};

export type CatchUp = {
  enter: (trigger: CatchUpTrigger) => CatchUpDecision[];
  watch: () => CatchUpDecision[];
  roomCopyRead: (r: string, fresh: boolean) => CatchUpDecision[];
  partyRead: (r: string, players: readonly PartyMember[] | null) => CatchUpDecision[];
  generationHeard: (generation: Generation, keepNonce: boolean) => CatchUpDecision[];
  generationRead: (generation: Generation) => CatchUpDecision[];
  adoptionStaged: () => CatchUpDecision[];
  heard: (senderRole: PlayerRole | null, message: { t: string; r?: string }) => CatchUpDecision[];
  stateRequested: (r: string) => CatchUpDecision[];
  pingReceived: () => CatchUpDecision[];
  aliveReceived: (
    message: AliveMessage,
    sender: string,
    relation: GenerationRelation,
  ) => CatchUpDecision[];
  stateMerged: (
    message: StateMessage,
    sender: string,
    relation: GenerationRelation,
  ) => CatchUpDecision[];
  fired: (timer: CatchUpTimer) => CatchUpDecision[];
  closing: () => CatchUpDecision[];
  partyChanged: (players: readonly PartyMember[]) => void;
  replicaReplaced: () => void;
  view: () => CatchUpView;
  live: () => boolean;
  adopting: () => Generation | null;
  answersOwn: (r: string) => boolean;
};

// The messages one responder has sent for this client's own `r`, by `i`.
type AnswerParts = { n: number; parts: Set<number> };

// One sender's differing digests counted in a row, and when the last one counted.
type DigestMismatches = { count: number; at: number };

type PartyMember = { connectionId: string; role: PlayerRole };

export function createCatchUp(options: CatchUpOptions): CatchUp {
  // AD-6: the catch-up module sets `gmLink` from GM-origin messages the engine admits, never from
  // the party.
  // Any admitted GM message counts, also one from a GM that is itself catching up, as the 2.4 spec
  // chooses: such a client still responds.
  let state: CatchUpView = {
    state: 'catching-up',
    firstCatchUpDone: false,
    gmAnswered: false,
    gmLink: 'offline',
  };

  // AD-7 catch-up. `ownNonce` is set only while catching up.
  let ownNonce: string | null = null;
  // The last `r` this client asked with. A complete answer to it that comes after a timeout still
  // shows that a GM client answered.
  let lastNonce: string | null = null;
  let answers = new Map<string, AnswerParts>();
  // True once any `state` for `ownNonce` arrived, so a re-entry need not ask again.
  let answerSeen = false;
  let catchUpTrigger: CatchUpTrigger = 'start';
  // The `r` of the last `state-request` sent, so a GM that comes online can be asked again.
  let sentNonce: string | null = null;
  // AD-9: the higher generation this client adopts, until it is complete. Its records gather in
  // `incoming`, apart from the replica, which keeps the old data shown and saved until then.
  let adoptionTarget: Generation | null = null;
  // The wait before the next `state-request` of an incomplete generation, doubled after each.
  let incompleteRetryMs = options.timing.incompleteRequestStartMs;
  // Every `r` this client has seen an answer to, or answered itself, since its last request.
  const answeredNonces = createBoundedIdSet(RECENT_NONCE_LIMIT);
  // Requests a GM client heard while it could not answer, oldest first. It answers the ones still
  // unanswered when its catch-up ends, as nobody asks again: a player whose request reached a GM
  // tab that was opening would otherwise never get its state.
  const heldRequests = new Set<string>();
  // AD-7 drift, by GM connection id: the last digest each one sent in `alive`, how many of its
  // `alive` in a row differed from this client's own digest, and the digest this client ignores
  // from it because its complete answer ended a catch-up while that was its last digest.
  const lastAliveDigests = new Map<string, number>();
  const digestMismatches = new Map<string, DigestMismatches>();
  const ignoredDigests = new Map<string, number>();
  // The GM whose drift started the current catch-up, while that catch-up lasts.
  let driftStarter: string | null = null;
  // Answers waiting for their random delay, by the asker's `r`.
  // The first delay wins.
  const armedAnswers = new Set<string>();

  function arm(timer: CatchUpTimer, delayMs: number): CatchUpDecision {
    return { type: 'arm', timer, delayMs };
  }

  function disarm(timer: CatchUpTimer): CatchUpDecision {
    if (timer.kind === 'answer') {
      armedAnswers.delete(timer.r);
    }

    return { type: 'disarm', timer };
  }

  // A GM whose storage could not be read keeps its records to itself, as with commits.
  // A catch-up for drift only pulls state, so a GM in one still answers. Two GMs that drift from each
  // other would otherwise both wait and time out, again and again.
  // AD-9: a client whose new generation is incomplete answers nothing.
  function canAnswer(): boolean {
    return (
      options.role() === 'GM' &&
      options.vouches() &&
      adoptionTarget === null &&
      (state.state === 'live' || catchUpTrigger === 'drift')
    );
  }

  function answerDelay(): number {
    const span = Math.max(
      0,
      options.timing.stateAnswerDelayMaxMs - options.timing.stateAnswerDelayMinMs,
    );

    return options.timing.stateAnswerDelayMinMs + options.random() * span;
  }

  function scheduleAnswer(r: string): CatchUpDecision[] {
    if (!canAnswer() || armedAnswers.has(r)) {
      return [];
    }

    armedAnswers.add(r);

    return [arm({ kind: 'answer', r }, answerDelay())];
  }

  function request(r: string): CatchUpDecision {
    // `sentNonce` is set when the request decision is returned, not when a jittered timer is armed.
    sentNonce = r;

    return { type: 'request', r };
  }

  // Story 2.6: every player heard the same GM, so a `gm-return` request waits a random part of the
  // answer delay.
  function ask(r: string): CatchUpDecision[] {
    if (catchUpTrigger !== 'gm-return') {
      return [request(r)];
    }

    return [arm({ kind: 'request', r }, options.random() * options.timing.stateAnswerDelayMaxMs)];
  }

  // `responder` is the GM client whose complete answer ended the catch-up. AD-9: a client whose new
  // generation is incomplete stays.
  function leave(exit: CatchUpExit, responder?: string): CatchUpDecision[] {
    if (adoptionTarget !== null || state.state !== 'catching-up') {
      return [];
    }

    // AD-7: a lagging GM keeps its digest after it answered, so comparing it again would loop. A
    // timeout exit proves nothing about any GM's records and starts no ignore.
    // The GM whose drift started the catch-up is ignored too: when another GM answered, a lagging
    // starter would otherwise start one catch-up after another.
    if (exit === 'answered') {
      for (const gm of [responder, driftStarter]) {
        const digest = gm === undefined || gm === null ? undefined : lastAliveDigests.get(gm);

        if (gm !== undefined && gm !== null && digest !== undefined) {
          ignoredDigests.set(gm, digest);
        }
      }
    }

    driftStarter = null;
    state = {
      state: 'live',
      firstCatchUpDone: true,
      gmAnswered: state.gmAnswered || exit === 'answered',
      gmLink: state.gmLink,
    };
    ownNonce = null;

    const decisions: CatchUpDecision[] = [
      disarm({ kind: 'catch-up' }),
      {
        type: 'caught-up',
        exit,
      },
    ];

    const held = [...heldRequests];

    heldRequests.clear();

    // Through the same delay and suppression as a fresh request: an answer seen meanwhile wins.
    for (const r of held) {
      if (!answeredNonces.has(r)) {
        decisions.push(...scheduleAnswer(r));
      }
    }

    return decisions;
  }

  function finishAdoption(fromCopy: boolean, responder?: string): CatchUpDecision[] {
    // AD-9: the new generation is complete. The engine saves it under the new generation first and
    // deletes the old one only once that save is complete. A save that fails keeps the old one and
    // raises the local-save notice. Catch-up then goes on by the usual rules.
    // `fromCopy`: the room copy completed it, so a copy of this generation is in the room. A save
    // that fails removes the part saved, keeps the old generation in storage and the adoption open,
    // so the next answer or copy tries again.
    if (adoptionTarget === null || !options.saveAdoption(adoptionTarget, fromCopy)) {
      return [];
    }

    forgetDigests();
    adoptionTarget = null;
    incompleteRetryMs = options.timing.incompleteRequestStartMs;
    const decisions: CatchUpDecision[] = [];

    if (state.state === 'catching-up') {
      decisions.push(arm({ kind: 'catch-up' }, options.timing.catchUpTimeoutMs));

      if (!fromCopy) {
        decisions.push(...leave('answered', responder));
      }
    }

    return decisions;
  }

  function enter(trigger: CatchUpTrigger): CatchUpDecision[] {
    // AD-7 entry. A start, a role change and a higher generation always ask with a new `r` and drop
    // the answers to the old one. A return while catching up keeps `r`, and asks again only when
    // nothing has answered it yet. Returns decisions synchronously; the engine reads the party
    // separately.
    const keepsNonce =
      trigger === 'page-return' && state.state === 'catching-up' && ownNonce !== null;

    if (keepsNonce && ownNonce !== null) {
      // The timeout keeps running from the first request, so returns cannot put the exit off.
      return [
        { type: 'entered', trigger, fresh: false },
        { type: 'read-room-copy', r: ownNonce, fresh: false },
      ];
    }

    const nonce = options.newId();

    state = { ...state, state: 'catching-up' };
    ownNonce = nonce;
    lastNonce = nonce;
    answers = new Map();
    answerSeen = false;
    catchUpTrigger = trigger;
    // A catch-up brings full state, so differences counted before it no longer say anything.
    digestMismatches.clear();

    if (trigger !== 'drift') {
      driftStarter = null;
    }

    return [
      { type: 'entered', trigger, fresh: true },
      arm(
        { kind: 'catch-up' },
        adoptionTarget === null
          ? options.timing.catchUpTimeoutMs
          : incompleteRetryMs - (options.random() * incompleteRetryMs) / 4,
      ),
      // Armed before the room copy read, so a read that never ends cannot hold catch-up open.
      { type: 'read-room-copy', r: nonce, fresh: true },
    ];
  }

  function watch(): CatchUpDecision[] {
    // AD-6: a GM-origin message puts off both the ping and the offline mark by the whole timeout.
    // Repeats every half timeout until a GM-origin message arrives. Only the answer keeps a GM
    // online, so a hidden GM tab whose own timers stall still counts as online (NFR11).
    return [
      arm({ kind: 'ping' }, pingDelay()),
      arm({ kind: 'gm-silence' }, options.timing.gmLinkTimeoutMs),
    ];
  }

  function pingDelay(): number {
    // Half the timeout and a random part of a quarter more, so clients that heard one GM message
    // together do not ping together and draw a burst of `alive`.
    return (
      options.timing.gmLinkTimeoutMs / 2 + (options.random() * options.timing.gmLinkTimeoutMs) / 4
    );
  }

  function setGmLink(next: GmLink, answersOwn: boolean): CatchUpDecision[] {
    // Story 2.6: a GM that speaks after `gmLink` was offline may hold newer data than a player, so a
    // live player catches up with a new `r`. A GM client does not: it would wait out the timeout with
    // its edits pending whenever another GM tab opens. A client still catching up asks again with the
    // same `r` if nothing answered it, as its request may have gone out before that GM was there.
    const decisions: CatchUpDecision[] = [];

    if (state.gmLink === next) {
      return decisions;
    }

    state = { ...state, gmLink: next };

    if (next === 'online' && options.role() !== 'GM') {
      // A GM is back, so the edits that waited for one go out now, not after their backoff.
      decisions.push({ type: 'gm-back' });
    }

    if (next === 'online' && !answersOwn && options.role() !== 'GM' && state.state === 'live') {
      // Its entry sends the delta that carries the new link.
      decisions.push(...enter('gm-return'));

      return decisions;
    }

    if (
      next === 'online' &&
      !answersOwn &&
      state.state === 'catching-up' &&
      ownNonce !== null &&
      sentNonce === ownNonce &&
      !answerSeen
    ) {
      decisions.push(request(ownNonce));
    }

    decisions.push({ type: 'show', projectedOnly: true });

    return decisions;
  }

  function enterFromGeneration(generation: Generation, keepNonce: boolean): CatchUpDecision[] {
    if (compareGenerations(generation, adoptionTarget ?? options.generation()) <= 0) {
      return [];
    }

    const previous = adoptionTarget;
    // A client that showed nothing yet, as a player that just joined, has nothing replaced.
    const hadData = options.hasData() || adoptionTarget !== null;

    // AD-9: a generation above this client's own, and above the one it adopts, starts adoption. Its
    // pending queue, the GM intents and the player entries alike, drops with the notification, and
    // catch-up runs. The replica keeps the old data until the new generation is complete.
    adoptionTarget = generation;
    incompleteRetryMs = options.timing.incompleteRequestStartMs;
    // Answers of the old generation end nothing now.
    answers = new Map();
    forgetDigests();

    if (keepNonce && state.state === 'catching-up' && ownNonce !== null) {
      catchUpTrigger = 'generation';

      return [{ type: 'adopt', generation, previous, keepNonce: true, hadData }];
    }

    return [
      { type: 'adopt', generation, previous, keepNonce: false, hadData },
      ...enter('generation'),
    ];
  }

  return {
    enter,
    watch,
    roomCopyRead: (r, fresh) => {
      // AD-7: the room copy merges after the persisted records and before the request. An alone GM
      // client so holds it before it leaves with no wait. `fresh` is a new `r`; a kept one is asked
      // again only when nothing has answered it during the read either.
      if (ownNonce !== r) {
        return [];
      }

      const decisions: CatchUpDecision[] = [];

      if (fresh || !answerSeen) {
        decisions.push(...ask(r));
      }

      if (options.role() === 'GM') {
        decisions.push({ type: 'read-party', r });
      }

      return decisions;
    },
    partyRead: (r, players) => {
      // AD-7: a GM client whose confirmed party read shows no other GM connection has nobody to wait
      // for. A failed read proves nothing, so the client waits for answers or the timeout.
      // AD-9: an incomplete generation waits for a GM client or its room copy, alone or not.
      if (
        players === null ||
        state.state !== 'catching-up' ||
        ownNonce !== r ||
        options.role() !== 'GM' ||
        adoptionTarget !== null
      ) {
        return [];
      }

      return players.some((player) => player.role === 'GM') ? [] : leave('unanswered');
    },
    generationHeard: enterFromGeneration,
    generationRead: (generation) =>
      enterFromGeneration(generation, state.state === 'catching-up' && ownNonce !== null),
    adoptionStaged: () => finishAdoption(true),
    // `answersOwn` is a `state` for this client's last `r`: it counts as an answer, so it starts no
    // GM-return catch-up, which would drop that `r`.
    heard: (senderRole, message) =>
      senderRole === 'GM'
        ? [...watch(), ...setGmLink('online', message.t === 'state' && message.r === lastNonce)]
        : [],
    stateRequested: (r) => {
      // AD-7 answer: a GM client that is live and can vouch for its records answers after a random
      // delay, unless an answer to `r` shows up first.
      // A request again for one `r` means the asker got no complete answer, so earlier answers no
      // longer count.
      answeredNonces.delete(r);

      if (options.role() === 'GM' && !canAnswer()) {
        // A request heard while this GM cannot answer waits until its catch-up ends. It answers the
        // ones still unanswered because nobody asks again.
        heldRequests.delete(r);
        heldRequests.add(r);

        for (const oldest of heldRequests) {
          if (heldRequests.size <= RECENT_NONCE_LIMIT) {
            break;
          }

          heldRequests.delete(oldest);
        }

        return [];
      }

      return scheduleAnswer(r);
    },
    // AD-6: a GM client answers on receipt, with no timer of its own. It answers only when it could
    // answer a `state-request` too, so its digest stands for records it would send.
    pingReceived: () => (canAnswer() && state.state === 'live' ? [{ type: 'alive' }] : []),
    aliveReceived: (message, sender, relation) => {
      // AD-7 drift. Only a digest of this client's own generation compares, and only while live: a
      // client in catch-up is about to get full state anyway.
      if (relation !== 'equal') {
        return [];
      }

      lastAliveDigests.set(sender, message.digest);

      // A GM's own commits still on their way would show as a difference.
      if (state.state !== 'live' || (options.role() === 'GM' && options.commitsUnsent())) {
        return [];
      }

      const ignored = ignoredDigests.get(sender);

      if (ignored === message.digest) {
        return [];
      }

      ignoredDigests.delete(sender);

      if (message.digest === options.digest()) {
        digestMismatches.delete(sender);

        return [];
      }

      // Every client answers one ping, so `alive` comes in bursts. A burst counts once, and a commit
      // in flight has time to land before a second difference counts.
      const now = options.now();
      const counted = digestMismatches.get(sender);

      if (counted !== undefined && now - counted.at < options.timing.gmLinkTimeoutMs / 2) {
        return [];
      }

      const count = (counted?.count ?? 0) + 1;

      if (count < DRIFT_ALIVE_COUNT) {
        digestMismatches.set(sender, { count, at: now });

        return [];
      }

      driftStarter = sender;

      return enter('drift');
    },
    stateMerged: (message, sender, relation) => {
      // Only a readable answer of this generation makes this client's own answer needless.
      const decisions: CatchUpDecision[] = [];

      if (relation === 'higher') {
        if (adoptionTarget === null || compareGenerations(message.g, adoptionTarget) !== 0) {
          return [];
        }

        if (message.r === ownNonce) {
          answerSeen = true;
        }

        // The adopted generation is staged by the engine before this event reaches the module.
      } else {
        answeredNonces.add(message.r);
        decisions.push(disarm({ kind: 'answer', r: message.r }));

        if (message.r === ownNonce) {
          answerSeen = true;
        }
      }

      // A partial answer counts as no answer: only all `n` messages of one responder end catch-up.
      // The parts of the last own `r` still count after a timeout, so a late complete answer shows
      // that a GM client answered.
      // AD-9: while a generation is adopted, only its answers count.
      if (
        message.r !== lastNonce ||
        (adoptionTarget !== null && compareGenerations(message.g, adoptionTarget) !== 0)
      ) {
        return decisions;
      }

      const held = answers.get(sender);
      const answer = held?.n === message.n ? held : { n: message.n, parts: new Set<number>() };

      answer.parts.add(message.i);
      answers.set(sender, answer);

      if (answer.parts.size !== answer.n) {
        return decisions;
      }

      if (adoptionTarget !== null) {
        return [...decisions, ...finishAdoption(false, sender)];
      }

      if (state.state === 'catching-up') {
        return [...decisions, ...leave('answered', sender)];
      }

      if (!state.gmAnswered) {
        state = { ...state, gmAnswered: true };
        decisions.push({ type: 'show', projectedOnly: false });
      }

      return decisions;
    },
    fired: (timer) => {
      switch (timer.kind) {
        case 'catch-up': {
          // AD-9: while the generation this client adopts is incomplete, the timeout does not end
          // catch-up. It reads the room copy and asks again, after a wait that doubles up to the max.
          if (state.state !== 'catching-up' || ownNonce === null) {
            return [];
          }

          if (adoptionTarget !== null) {
            incompleteRetryMs = Math.min(
              incompleteRetryMs * 2,
              options.timing.incompleteRequestMaxMs,
            );

            return [
              // The jitter keeps the clients that saw one `reset` from asking together.
              arm(
                { kind: 'catch-up' },
                incompleteRetryMs - (options.random() * incompleteRetryMs) / 4,
              ),
              { type: 'read-room-copy', r: ownNonce, fresh: true },
            ];
          }

          return leave('unanswered');
        }

        case 'ping':
          return [{ type: 'ping' }, arm({ kind: 'ping' }, pingDelay())];
        case 'gm-silence':
          return setGmLink('offline', false);
        case 'request':
          return ownNonce === timer.r && state.state === 'catching-up' ? [request(timer.r)] : [];
        case 'answer':
          armedAnswers.delete(timer.r);

          return canAnswer() && !answeredNonces.has(timer.r)
            ? (answeredNonces.add(timer.r), [{ type: 'answer', r: timer.r }])
            : [];
      }
    },
    closing: () =>
      state.state === 'catching-up' && adoptionTarget === null ? leave('unanswered') : [],
    partyChanged: (players) => {
      // Connections that left the party will never send `alive` again.
      const present = new Set(players.map((player) => player.connectionId));

      for (const map of [lastAliveDigests, digestMismatches, ignoredDigests]) {
        for (const connection of map.keys()) {
          if (!present.has(connection)) {
            map.delete(connection);
          }
        }
      }
    },
    replicaReplaced: () => {
      forgetDigests();
    },
    view: () => ({ ...state }),
    live: () => state.state === 'live',
    adopting: () => adoptionTarget,
    answersOwn: (r) => r === ownNonce,
  };

  function forgetDigests(): void {
    lastAliveDigests.clear();
    digestMismatches.clear();
    ignoredDigests.clear();
    driftStarter = null;
  }
}
