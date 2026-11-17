import type { VersionedRecord } from '@/core/records';
import { describe, expect, spyOn, test } from 'bun:test';
import type { JsonValue } from '@/core/json';
import {
  type GenerationRelation,
  parseRoomMessage,
  type RoomMessageType,
  type SenderRole,
} from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import { encodeStateRecords } from '@/core/state-records';
import type { RoomSender } from '@/replica/party-roster';
import { createRoomProtocol, type RoomProtocolPorts } from '@/replica/room-protocol';

const OWN_GENERATION: Generation = { n: 1, a: '' };
const HIGHER_GENERATION: Generation = { n: 2, a: '' };

const RECORD: VersionedRecord = {
  k: 'blk:a',
  d: { set: 'pc', order: 0, cells: {} },
  c: 1,
  a: 'gm-a',
  l: [1, 'seed'],
};

const PLAYER: RoomSender = { role: 'PLAYER', playerId: 'player-a', name: 'Player' };
const GM: RoomSender = { role: 'GM', playerId: 'gm-a', name: 'GM' };

const TYPES: readonly RoomMessageType[] = [
  'commit',
  'propose',
  'reject',
  'ping',
  'alive',
  'state-request',
  'state',
  'reset',
  'roll',
];

const SENDERS: readonly SenderRole[] = ['GM', 'PLAYER', null];
const RELATIONS: readonly GenerationRelation[] = ['lower', 'equal', 'higher'];

// AD-5 is written out by hand from the room-traffic contract. Every combination not listed drops.
const ADMITTED = new Set([
  'commit GM equal',
  'reject GM equal',
  'state GM equal',
  'state GM higher',
  'reset GM higher',
  'alive GM lower',
  'alive GM equal',
  'alive GM higher',
  'propose GM equal',
  'propose PLAYER equal',
  'ping GM lower',
  'ping GM equal',
  'ping GM higher',
  'ping PLAYER lower',
  'ping PLAYER equal',
  'ping PLAYER higher',
  'state-request GM lower',
  'state-request GM equal',
  'state-request GM higher',
  'state-request PLAYER lower',
  'state-request PLAYER equal',
  'state-request PLAYER higher',
  'roll GM lower',
  'roll GM equal',
  'roll GM higher',
  'roll PLAYER lower',
  'roll PLAYER equal',
  'roll PLAYER higher',
]);

type AdmissionCase = readonly [RoomMessageType, SenderRole, GenerationRelation];

type AdmissionControl = {
  sender: SenderRole;
  relation: GenerationRelation;
  handlerEffects: string[];
};

type CoreAdmissionOwner = {
  admission: AdmissionCase;
  owner: string;
  noTestReason: string;
};

const CORE_ADMISSION_OWNED_REJECTIONS: readonly CoreAdmissionOwner[] = [
  {
    admission: ['propose', 'PLAYER', 'lower'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > propose from PLAYER with a lower generation follows the AD-5 table',
    noTestReason:
      'The rejected proposal returns from receiveProposal without a handler or liveness effect.',
  },
  {
    admission: ['propose', 'PLAYER', 'higher'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > propose from PLAYER with a higher generation follows the AD-5 table',
    noTestReason:
      'The rejected proposal returns from receiveProposal without a handler or liveness effect.',
  },
  {
    admission: ['propose', null, 'lower'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > propose from null with a lower generation follows the AD-5 table',
    noTestReason:
      'The rejected proposal returns from receiveProposal without a handler or liveness effect.',
  },
  {
    admission: ['propose', null, 'equal'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > propose from null with a equal generation follows the AD-5 table',
    noTestReason:
      'The rejected proposal returns from receiveProposal without a handler or liveness effect.',
  },
  {
    admission: ['propose', null, 'higher'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > propose from null with a higher generation follows the AD-5 table',
    noTestReason:
      'The rejected proposal returns from receiveProposal without a handler or liveness effect.',
  },
  {
    admission: ['reset', 'PLAYER', 'lower'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > reset from PLAYER with a lower generation follows the AD-5 table',
    noTestReason: 'Reset dispatch has no handler or liveness effect for a player sender.',
  },
  {
    admission: ['reset', 'PLAYER', 'equal'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > reset from PLAYER with a equal generation follows the AD-5 table',
    noTestReason: 'Reset dispatch has no handler or liveness effect for a player sender.',
  },
  {
    admission: ['reset', 'PLAYER', 'higher'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > reset from PLAYER with a higher generation follows the AD-5 table',
    noTestReason: 'Reset dispatch has no handler or liveness effect for a player sender.',
  },
  {
    admission: ['reset', null, 'lower'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > reset from null with a lower generation follows the AD-5 table',
    noTestReason: 'Reset dispatch has no handler or liveness effect without a sender.',
  },
  {
    admission: ['reset', null, 'equal'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > reset from null with a equal generation follows the AD-5 table',
    noTestReason: 'Reset dispatch has no handler or liveness effect without a sender.',
  },
  {
    admission: ['reset', null, 'higher'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > reset from null with a higher generation follows the AD-5 table',
    noTestReason: 'Reset dispatch has no handler or liveness effect without a sender.',
  },
  {
    admission: ['roll', null, 'lower'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > roll from null with a lower generation follows the AD-5 table',
    noTestReason:
      'Roll dispatch requires a member, so it has no handler or liveness effect without one.',
  },
  {
    admission: ['roll', null, 'equal'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > roll from null with a equal generation follows the AD-5 table',
    noTestReason:
      'Roll dispatch requires a member, so it has no handler or liveness effect without one.',
  },
  {
    admission: ['roll', null, 'higher'],
    owner:
      'src/core/room-messages.test.ts: admitRoomMessage > roll from null with a higher generation follows the AD-5 table',
    noTestReason:
      'Roll dispatch requires a member, so it has no handler or liveness effect without one.',
  },
];

const REJECTED_CASES: AdmissionCase[] = TYPES.flatMap((type) =>
  SENDERS.flatMap((sender) =>
    RELATIONS.flatMap((relation) => {
      const coreOwnsAdmission = CORE_ADMISSION_OWNED_REJECTIONS.some(
        ({ admission }) =>
          admission[0] === type && admission[1] === sender && admission[2] === relation,
      );

      return ADMITTED.has(`${type} ${sender} ${relation}`) || coreOwnsAdmission
        ? []
        : [[type, sender, relation] as const];
    }),
  ),
);

const ADMITTED_CONTROLS: Record<RoomMessageType, AdmissionControl> = {
  commit: {
    sender: 'GM',
    relation: 'equal',
    handlerEffects: ['heard', 'answered', 'receive-records'],
  },
  propose: { sender: 'GM', relation: 'equal', handlerEffects: ['heard'] },
  reject: { sender: 'GM', relation: 'equal', handlerEffects: ['heard', 'rejected'] },
  ping: { sender: 'GM', relation: 'equal', handlerEffects: ['heard', 'ping'] },
  alive: { sender: 'GM', relation: 'equal', handlerEffects: ['heard', 'alive'] },
  'state-request': {
    sender: 'GM',
    relation: 'equal',
    handlerEffects: ['heard', 'state-request:control'],
  },
  state: {
    sender: 'GM',
    relation: 'equal',
    handlerEffects: ['heard', 'receive-records', 'state'],
  },
  reset: { sender: 'GM', relation: 'higher', handlerEffects: ['heard'] },
  roll: { sender: 'GM', relation: 'equal', handlerEffects: ['heard', 'roll'] },
};

function createPorts(
  effects: string[],
  senderOf: RoomProtocolPorts['senderOf'] = async () => PLAYER,
): RoomProtocolPorts {
  return {
    senderOf,
    role: () => 'PLAYER',
    stopped: () => false,
    generation: () => OWN_GENERATION,
    catchUp: {
      adopting: () => null,
      answersOwn: () => false,
      heard: () => {
        effects.push('heard');

        return [];
      },
      stateRequested: (request) => {
        effects.push(`state-request:${request}`);

        return [];
      },
      pingReceived: () => {
        effects.push('ping');

        return [];
      },
      aliveReceived: () => {
        effects.push('alive');

        return [];
      },
      stateMerged: () => {
        effects.push('state');

        return [];
      },
    },
    seeGeneration: () => [],
    stageGeneration: () => {},
    runCatchUp: async () => {},
    onNewerVersion: () => {
      effects.push('newer-version');
    },
    records: () => new Map(),
    presetOf: () => null,
    live: () => false,
    hasPersistence: () => false,
    apply: () => [],
    liveContext: () => ({
      records: new Map(),
      mint: (_key, highestKnownCounter) => ({ c: highestKnownCounter + 1, a: 'test' }),
      newRecordId: () => 'record',
      isGmPlayer: () => false,
      mode: 'persisted',
    }),
    receiveRecords: () => {
      effects.push('receive-records');

      return [];
    },
    pendingEdits: {
      answered: () => {
        effects.push('answered');

        return false;
      },
      rejected: () => {
        effects.push('rejected');

        return null;
      },
    },
    publish: () => {
      effects.push('publish');
    },
    roomCopyEdited: () => {
      effects.push('room-copy-edited');
    },
    sendCommits: () => {
      effects.push('send-commits');
    },
    sendRemote: async () => {
      effects.push('send-remote');
    },
    notifyDenied: () => {
      effects.push('notify-denied');
    },
    rollFlow: {
      receiveRoll: () => {
        effects.push('roll');
      },
    },
  };
}

function createAdmissionPorts(
  handlerEffects: string[],
  preAdmissionEffects: string[],
  senderOf: RoomProtocolPorts['senderOf'],
): RoomProtocolPorts {
  const ports = createPorts(handlerEffects, senderOf);
  ports.catchUp.adopting = () => HIGHER_GENERATION;
  ports.seeGeneration = () => {
    preAdmissionEffects.push('see-generation');

    return [];
  };

  ports.stageGeneration = () => {
    preAdmissionEffects.push('stage-generation');
  };

  return ports;
}

function event(data: JsonValue, connectionId = 'sender') {
  return { data, connectionId };
}

function generationFor(relation: GenerationRelation): Generation {
  return { n: relation === 'lower' ? 0 : relation === 'equal' ? 1 : 2, a: '' };
}

function messageFor(type: RoomMessageType, g: Generation, request = 'request'): JsonValue {
  switch (type) {
    case 'commit':
      return { v: 4, g, t: 'commit', records: [RECORD] };
    case 'propose':
      return { v: 4, g, t: 'propose', records: [RECORD] };
    case 'reject':
      return { v: 4, g, t: 'reject', k: RECORD.k, c: RECORD.c, a: RECORD.a, reason: 'denied' };
    case 'ping':
      return { v: 4, g, t: 'ping' };
    case 'alive':
      return { v: 4, g, t: 'alive', digest: 1 };
    case 'state-request':
      return { v: 4, g, t: 'state-request', r: request };
    case 'state':
      return { v: 4, g, t: 'state', r: request, i: 1, n: 1, records: encodeStateRecords([RECORD]) };
    case 'reset':
      return { v: 4, g, t: 'reset' };
    case 'roll':
      return {
        v: 4,
        g,
        t: 'roll',
        id: 'roll',
        sheetId: 'sheet',
        hidden: false,
        roller: 'Player',
        sheetName: 'Sheet',
        cell: 'Stat',
        result: { roll: 1, faces: [1], target: null, targetFaces: [], outcome: null },
      };
    default:
      throw new Error('unknown room message type');
  }
}

function senderFor(role: SenderRole): RoomSender | null {
  if (role === null) {
    return null;
  }

  return role === 'GM' ? GM : PLAYER;
}

function preAdmissionEffectsFor(
  type: RoomMessageType,
  sender: SenderRole,
  relation: GenerationRelation,
): string[] {
  if (sender !== 'GM' || relation !== 'higher') {
    return [];
  }

  return type === 'commit' ? ['see-generation', 'stage-generation'] : ['see-generation'];
}

function settleIngress(remaining = 8): Promise<void> {
  return remaining === 0
    ? Promise.resolve()
    : Promise.resolve().then(() => settleIngress(remaining - 1));
}

describe('createRoomProtocol', () => {
  test('keeps a later event behind a delayed earlier sender lookup', async () => {
    // #given
    const effects: string[] = [];
    let releaseFirst!: (sender: RoomSender | null) => void;

    const firstSender = new Promise<RoomSender | null>((resolve) => {
      releaseFirst = resolve;
    });

    const protocol = createRoomProtocol(
      createPorts(effects, (connectionId) =>
        connectionId === 'first' ? firstSender : Promise.resolve(PLAYER),
      ),
    );

    // #when
    protocol.receive(event(messageFor('state-request', OWN_GENERATION), 'first'));
    protocol.receive(event(messageFor('state-request', OWN_GENERATION, 'second'), 'second'));
    await settleIngress();
    const beforeFirstLookup = [...effects];
    releaseFirst(PLAYER);
    await settleIngress();
    // #then
    expect([beforeFirstLookup, effects]).toEqual([
      [],
      ['state-request:request', 'state-request:second'],
    ]);
  });
  test('continues with the next room event after a handler throws', async () => {
    // #given
    const effects: string[] = [];
    const ports = createPorts(effects);
    ports.catchUp.pingReceived = () => {
      effects.push('ping');
      throw new Error('handler failed');
    };

    const protocol = createRoomProtocol(ports);
    const errors = spyOn(console, 'error').mockImplementation(() => {});

    // #when
    try {
      protocol.receive(event(messageFor('ping', OWN_GENERATION)));
      protocol.receive(event(messageFor('state-request', OWN_GENERATION)));
      await settleIngress();
    } finally {
      errors.mockRestore();
    }

    // #then
    expect(effects).toEqual(['ping', 'state-request:request']);
  });
  test('drops a malformed room message before it reaches admission', async () => {
    // #given
    const handlerEffects: string[] = [];
    const senderLookups: string[] = [];
    const malformed = { v: 4, g: OWN_GENERATION, t: 'state-request' };

    const protocol = createRoomProtocol(
      createPorts(handlerEffects, async (connectionId) => {
        senderLookups.push(connectionId);

        return PLAYER;
      }),
    );

    // #when
    protocol.receive(event(malformed));
    await settleIngress();
    // #then
    expect({ parsed: parseRoomMessage(malformed).ok, senderLookups, handlerEffects }).toEqual({
      parsed: false,
      senderLookups: [],
      handlerEffects: [],
    });
  });
  test.each(REJECTED_CASES)(
    '%s from %s with a %s generation has no handler effect after parsing',
    async (type, sender, relation) => {
      // #given
      const rejectedMessage = messageFor(type, generationFor(relation));
      const control = ADMITTED_CONTROLS[type];
      const handlerEffects: string[] = [];
      const preAdmissionEffects: string[] = [];

      const protocol = createRoomProtocol(
        createAdmissionPorts(handlerEffects, preAdmissionEffects, async (connectionId) =>
          senderFor(connectionId === 'rejected' ? sender : control.sender),
        ),
      );

      // #when
      protocol.receive(event(rejectedMessage, 'rejected'));
      await settleIngress();

      const rejectedEffects = {
        handlerEffects: [...handlerEffects],
        preAdmissionEffects: [...preAdmissionEffects],
      };

      protocol.receive(
        event(messageFor(type, generationFor(control.relation), 'control'), 'control'),
      );
      await settleIngress();
      // #then
      expect({
        parsed: parseRoomMessage(rejectedMessage).ok,
        rejected: rejectedEffects,
        admittedControl: {
          handlerEffects: handlerEffects.slice(rejectedEffects.handlerEffects.length),
          preAdmissionEffects: preAdmissionEffects.slice(
            rejectedEffects.preAdmissionEffects.length,
          ),
        },
      }).toEqual({
        parsed: true,
        rejected: {
          handlerEffects: [],
          preAdmissionEffects: preAdmissionEffectsFor(type, sender, relation),
        },
        admittedControl: {
          handlerEffects: control.handlerEffects,
          preAdmissionEffects: preAdmissionEffectsFor(type, control.sender, control.relation),
        },
      });
    },
  );
  test('drops an in-flight room message when the engine stops during sender lookup', async () => {
    // #given
    const effects: string[] = [];
    let stopped = false;
    let release!: (sender: RoomSender | null) => void;

    const sender = new Promise<RoomSender | null>((resolve) => {
      release = resolve;
    });

    const ports = createPorts(effects, () => sender);
    ports.stopped = () => stopped;
    const protocol = createRoomProtocol(ports);
    // #when
    protocol.receive(event(messageFor('state-request', OWN_GENERATION)));
    await settleIngress();
    stopped = true;
    release(PLAYER);
    await settleIngress();
    // #then
    expect(effects).toEqual([]);
  });
  test('an unrelated higher state answer does not retain the current nonce', async () => {
    // #given
    const effects: string[] = [];
    let keptNonce: boolean | undefined;
    const ports = createPorts(effects, async () => GM);
    ports.catchUp.answersOwn = () => false;
    ports.catchUp.adopting = () => HIGHER_GENERATION;
    ports.seeGeneration = (_generation, keepNonce) => {
      keptNonce = keepNonce;

      return [];
    };

    const protocol = createRoomProtocol(ports);
    // #when
    protocol.receive(event(messageFor('state', HIGHER_GENERATION, 'other')));
    await settleIngress();
    // #then
    expect(keptNonce).toBe(false);
  });
  test('an idempotent commit still publishes a cleared pending edit', async () => {
    // #given
    const effects: string[] = [];
    const ports = createPorts(effects, async () => GM);
    ports.pendingEdits.answered = () => true;
    ports.receiveRecords = () => [];
    const protocol = createRoomProtocol(ports);
    // #when
    protocol.receive(event(messageFor('commit', OWN_GENERATION)));
    await settleIngress();
    // #then
    expect(effects).toEqual(['heard', 'publish']);
  });
  test('a stale rejection without denial does not show a denied notice', async () => {
    // #given
    const effects: string[] = [];
    const ports = createPorts(effects, async () => GM);
    ports.pendingEdits.rejected = () => ({ notify: false, merge: null });
    const protocol = createRoomProtocol(ports);
    // #when
    protocol.receive(event(messageFor('reject', OWN_GENERATION)));
    await settleIngress();
    // #then
    expect(effects).toEqual(['heard', 'publish']);
  });
  test('a higher state outside the current adoption target is not staged', async () => {
    // #given
    const effects: string[] = [];
    const target = { n: 3, a: '' };
    const ports = createPorts(effects, async () => GM);
    ports.catchUp.adopting = () => target;
    ports.seeGeneration = () => [];
    ports.stageGeneration = () => effects.push('stage');
    const protocol = createRoomProtocol(ports);
    // #when
    protocol.receive(event(messageFor('state', HIGHER_GENERATION)));
    await settleIngress();
    // #then
    expect(effects).toEqual(['heard']);
  });
});
