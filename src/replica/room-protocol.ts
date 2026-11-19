import { checkProposal, type ProposalContext } from '@/core/access';
import { createFragmentAssembler, GM_FRAGMENT_ASSEMBLER_LIMITS } from '@/core/fragment-assembler';
import type { JsonValue } from '@/core/json';
import { compareGenerations } from '@/core/merge';
import {
  fitsOneMessage,
  fragmentRecord,
  jsonByteLength,
  recordFitsOneMessage,
} from '@/core/message-size';
import {
  admitRoomMessage,
  editIdOf,
  generationRelation,
  parseRoomMessage,
  rejectMessage,
  type GenerationRelation,
  type ProposeMessage,
  type RejectMessage,
  type RoomMessage,
  type StateMessage,
} from '@/core/room-messages';
import { decodeStateRecords } from '@/core/state-records';
import type { Generation } from '@/core/storage-key';
import type { Preset } from '@/core/preset';
import { parseBlockKey } from '@/core/block-address';
import { blockDataSchema, type VersionedRecord } from '@/core/records';
import type { PlayerRole } from '@/core/visibility';
import type { ComposeContext } from '@/core/compose';
import { blockLinkTombstones } from '@/core/compose';
import type { CatchUp, CatchUpDecision } from '@/replica/catch-up';
import type { PendingEdits } from '@/replica/pending-edits';
import type { RoomSender } from '@/replica/party-roster';
import type { RollFlow } from '@/replica/roll-flow';

export type RoomProtocolEvent = {
  data: JsonValue;
  connectionId: string;
};

type RoomProtocolCatchUp = Pick<
  CatchUp,
  | 'adopting'
  | 'answersOwn'
  | 'heard'
  | 'stateRequested'
  | 'pingReceived'
  | 'aliveReceived'
  | 'stateMerged'
>;

export type RoomProtocolPorts = {
  senderOf: (connectionId: string) => Promise<RoomSender | null>;
  role: () => PlayerRole;
  stopped: () => boolean;
  generation: () => Generation;
  catchUp: RoomProtocolCatchUp;
  seeGeneration: (generation: Generation, keepNonce: boolean) => CatchUpDecision[];
  stageGeneration: (records: readonly VersionedRecord[]) => void;
  runCatchUp: (decisions: readonly CatchUpDecision[]) => Promise<void>;
  onNewerVersion: () => void;
  records: () => ReadonlyMap<string, VersionedRecord>;
  presetOf: (record: VersionedRecord | undefined) => Preset | null;
  live: () => boolean;
  hasPersistence: () => boolean;
  apply: (records: readonly VersionedRecord[]) => VersionedRecord[];
  liveContext: () => ComposeContext;
  receiveRecords: (records: readonly VersionedRecord[]) => VersionedRecord[];
  pendingEdits: Pick<PendingEdits, 'answered' | 'rejected'>;
  publish: () => void;
  roomCopyEdited: () => void;
  sendCommits: (
    records: readonly VersionedRecord[],
    acks?: readonly ReturnType<typeof editIdOf>[],
  ) => void;
  sendRemote: (message: RejectMessage) => Promise<void>;
  notifyDenied: () => void;
  rollFlow: Pick<RollFlow, 'receiveRoll'>;
};

export type RoomProtocol = {
  receive: (event: RoomProtocolEvent) => void;
};

function staleReplyFragments(
  stale: RejectMessage,
  current: VersionedRecord,
): VersionedRecord[] | null {
  let reserveBytes = jsonByteLength(stale) - jsonByteLength(current) + 1;
  let fragments = fragmentRecord(current, reserveBytes);

  for (;;) {
    if (!fragments.isOk()) {
      return null;
    }

    const total = fragments.value.length;

    if (total === 1) {
      return fragments.value;
    }

    // The fragment count changes the numbered envelope. Repack until the count and its reserve
    // agree, rather than reserving for an unrelated proposal-part limit.
    const numbered = { ...stale, i: total, n: total };
    reserveBytes = jsonByteLength(numbered) - jsonByteLength(current) + 1;
    const next = fragmentRecord(current, reserveBytes);

    if (!next.isOk() || next.value.length === total) {
      return next.isOk() ? next.value : null;
    }

    fragments = next;
  }
}

export function createRoomProtocol(ports: RoomProtocolPorts): RoomProtocol {
  let roomMessages: Promise<void> = Promise.resolve();
  const proposalFragments = createFragmentAssembler(GM_FRAGMENT_ASSEMBLER_LIMITS);

  function receive(event: RoomProtocolEvent): void {
    // One message at a time in arrival order, so a sender lookup never lets a later message
    // overtake. The catch keeps one failed handler from stopping the ingress queue.
    roomMessages = roomMessages
      .then(() => handleRoomMessage(event))
      .catch((error) => {
        console.error('Muster Roll could not handle a room message', error);
      });
  }

  async function handleRoomMessage(event: RoomProtocolEvent): Promise<void> {
    const parsed = parseRoomMessage(event.data);

    if (!parsed.isOk()) {
      if (parsed.error === 'newer-version') {
        ports.onNewerVersion();
      }

      return;
    }

    const message = parsed.value;
    const sender = await ports.senderOf(event.connectionId);

    if (ports.stopped()) {
      return;
    }

    const relation = generationRelation(message.g, ports.generation());

    // AD-5 and AD-9: a GM that speaks from a higher generation, by `reset` or any other message,
    // starts adoption. An answer to this client's own request keeps that request.
    if (relation === 'higher' && sender?.role === 'GM') {
      continueCatchUp(
        ports.seeGeneration(
          message.g,
          message.t === 'state' && ports.catchUp.answersOwn(message.r),
        ),
        'Muster Roll could not start generation adoption',
      );

      // The gate takes a commit of its own generation only, so one of the generation adopted
      // gathers here, or it would be lost until the next drift check.
      if (
        message.t === 'commit' &&
        ports.catchUp.adopting() !== null &&
        compareGenerations(message.g, ports.catchUp.adopting()!) === 0
      ) {
        ports.stageGeneration(message.records);
      }
    }

    // AD-5 is the one admission decision for every room message. No handler runs before this.
    if (!admitRoomMessage(message.t, sender?.role ?? null, relation)) {
      return;
    }

    // AD-6: any admitted message from a GM sender shows that a GM client answers.
    if (sender?.role === 'GM') {
      continueCatchUp(
        ports.catchUp.heard(sender.role, message),
        'Muster Roll could not update the GM link',
      );
    }

    dispatchRoomMessage(message, event.connectionId, sender, relation);
  }

  function dispatchRoomMessage(
    message: RoomMessage,
    sender: string,
    member: RoomSender | null,
    relation: GenerationRelation,
  ): void {
    switch (message.t) {
      case 'commit': {
        const cleared = ports.role() === 'GM' ? false : ports.pendingEdits.answered(message.acks);

        // AD-8: another GM's edit changed the replica, so this GM writes too. The jitter keeps
        // GM clients from writing together.
        if (ports.receiveRecords(message.records).length > 0) {
          ports.roomCopyEdited();
        } else if (cleared) {
          ports.publish();
        }

        break;
      }

      case 'propose':
        receiveProposal(message, sender, member);
        break;
      case 'reject':
        receiveReject(message);
        break;
      case 'state-request':
        continueCatchUp(
          ports.catchUp.stateRequested(message.r),
          'Muster Roll could not answer a state request',
        );
        break;
      case 'state':
        receiveState(message, sender, relation);
        break;
      case 'ping':
        continueCatchUp(ports.catchUp.pingReceived(), 'Muster Roll could not answer a ping');
        break;
      case 'alive':
        continueCatchUp(
          ports.catchUp.aliveReceived(message, sender, relation),
          'Muster Roll could not process a liveness message',
        );
        break;
      case 'roll':
        if (member !== null) {
          ports.rollFlow.receiveRoll(message, member);
        }

        break;
      // AD-9: the gate admits only a higher generation from a GM, which started adoption above.
      case 'reset':
        break;
      default:
        unknownRoomMessage(message);
    }
  }

  function proposalContext(records: ReadonlyMap<string, VersionedRecord>): ProposalContext {
    return { records, preset: ports.presetOf(records.get('preset')) };
  }

  // AD-4: a GM client that is live and can vouch for its records checks a player's proposal in
  // `core/access`. It merges a passed record unchanged and commits it, or the existing tombstone
  // for a removal of a removed row, echoing the proposer's `(k, c, a)` either way; or it rejects
  // with that echo. A GM in catch-up neither commits nor rejects: the player resends.
  function receiveProposal(
    message: ProposeMessage,
    sender: string,
    member: RoomSender | null,
  ): void {
    if (ports.role() !== 'GM' || !ports.live() || !ports.hasPersistence() || member === null) {
      return;
    }

    let [record] = message.records;

    if (record === undefined) {
      return;
    }

    if (message.n > 1) {
      const key = JSON.stringify([sender, message.g, editIdOf(record)]);

      const outcome = proposalFragments.add(
        key,
        { i: message.i, n: message.n, record },
        Date.now(),
      );

      switch (outcome.kind) {
        case 'complete':
          record = outcome.record;
          break;
        case 'waiting':
        case 'ignored':
        case 'dropped':
          return;
        default: {
          const exhaustive: never = outcome;

          return exhaustive;
        }
      }
    }

    const edit = editIdOf(record);

    // No GM client could commit it, so the player hears now rather than resending forever.
    if (!recordFitsOneMessage(record)) {
      sendRoom(rejectMessage(ports.generation(), edit, { reason: 'denied' }));

      return;
    }

    const verdict = checkProposal(
      proposalContext(ports.records()),
      { playerId: member.playerId, author: sender },
      record,
    );

    switch (verdict.kind) {
      case 'commit': {
        const before = ports.records().get(record.k);
        ports.apply([record]);
        const winner = ports.records().get(record.k) ?? record;
        const changed = winner !== before;

        ports.publish();

        if (changed) {
          ports.roomCopyEdited();
        }

        ports.sendCommits([winner], [edit]);
        unlinkRemovedBlock(winner);

        break;
      }

      case 'commit-existing':
        ports.sendCommits([verdict.record], [edit]);
        unlinkRemovedBlock(verdict.record);
        break;
      case 'denied':
        sendRoom(rejectMessage(ports.generation(), edit, { reason: 'denied' }));
        break;
      case 'stale': {
        const current = proposalReadBack(verdict.current, record);
        const stale = rejectMessage(ports.generation(), edit, { reason: 'stale', current });
        const fragments = staleReplyFragments(stale, current);

        if (fragments === null) {
          sendRoom(rejectMessage(ports.generation(), edit, { reason: 'denied' }));

          break;
        }

        const total = fragments.length;

        for (const [index, fragment] of fragments.entries()) {
          const answer =
            total === 1
              ? stale
              : {
                  ...rejectMessage(ports.generation(), edit, {
                    reason: 'stale',
                    current: fragment,
                  }),
                  i: index + 1,
                  n: total,
                };

          sendRoom(answer);
        }

        break;
      }

      default:
        unknownVerdict(verdict);
    }
  }

  // AD-19: the GM client that commits a player's removal of a repeat block tombstones the links to
  // it in the next batch.
  function unlinkRemovedBlock(record: VersionedRecord): void {
    const block = record.d === null ? parseBlockKey(record.k) : null;

    if (block === null || block.path.length === 0) {
      return;
    }

    const applied = ports.apply(blockLinkTombstones(ports.liveContext(), block));

    if (applied.length > 0) {
      ports.publish();
      ports.sendCommits(applied);
      ports.roomCopyEdited();
    }
  }

  function sendRoom(message: RejectMessage): void {
    if (!fitsOneMessage(message)) {
      console.error('Muster Roll built a rejection too large for one message', message.k);

      return;
    }

    ports.sendRemote(message).catch((error) => {
      console.error('Muster Roll could not answer a proposal', error);
    });
  }

  function receiveReject(message: RejectMessage): void {
    if (ports.role() === 'GM') {
      return;
    }

    const result = ports.pendingEdits.rejected(message);

    if (result === null) {
      return;
    }

    if (result.notify) {
      ports.notifyDenied();
    }

    // The GM's record merges too: it is newer than this client's.
    const changed = result.merge === null ? [] : ports.receiveRecords([result.merge]);

    if (changed.length === 0) {
      ports.publish();
    }
  }

  function receiveState(message: StateMessage, sender: string, relation: GenerationRelation): void {
    const records = decodeStateRecords(message.records);

    if (!records.isOk()) {
      console.error('Muster Roll dropped a state message it could not read');

      return;
    }

    if (relation === 'higher') {
      // AD-9: the gate started adoption already. Only the generation adopted gathers, apart from
      // the replica, and only its answers complete it.
      const target = ports.catchUp.adopting();

      if (target === null || compareGenerations(message.g, target) !== 0) {
        return;
      }

      ports.stageGeneration(records.value);
      continueCatchUp(
        ports.catchUp.stateMerged(message, sender, relation),
        'Muster Roll could not process an adopted state answer',
      );

      return;
    }

    // Every `state` merges whenever it arrives, in any state.
    ports.receiveRecords(records.value);
    continueCatchUp(
      ports.catchUp.stateMerged(message, sender, relation),
      'Muster Roll could not process a state answer',
    );
  }

  function continueCatchUp(decisions: readonly CatchUpDecision[], message: string): void {
    void ports.runCatchUp(decisions).catch((error) => {
      console.error(message, error);
    });
  }

  return { receive };
}

function proposalReadBack(current: VersionedRecord, proposal: VersionedRecord): VersionedRecord {
  const held = blockDataSchema.safeParse(current.d).data;
  const patch = blockDataSchema.safeParse(proposal.d).data;

  if (held === undefined || patch === undefined) return current;

  const cells = Object.fromEntries(
    Object.entries(held.cells).filter(([id]) => Object.hasOwn(patch.cells, id)),
  );

  return { ...current, l: current.l ?? [current.c, current.a], d: { ...held, cells } };
}

function unknownVerdict(verdict: never): never {
  throw new Error(`Muster Roll has no case for the proposal verdict ${JSON.stringify(verdict)}`);
}

function unknownRoomMessage(message: never): never {
  throw new Error(`Muster Roll has no handler for the room message ${JSON.stringify(message)}`);
}
