import { describe, expect, spyOn, test } from 'bun:test';

import type { JsonValue } from '@/core/json';
import {
  type GenerationRelation,
  type RoomMessageType,
  type SenderRole,
} from '@/core/room-messages';
import type { Generation } from '@/core/storage-key';
import { encodeStateRecords } from '@/core/state-records';
import type { RoomSender } from '@/replica/party-roster';
import { createRoomProtocol, type RoomProtocolPorts } from '@/replica/room-protocol';

const OWN_GENERATION: Generation = { n: 1, a: '' };
const RECORD = { k: 'sheet:a', d: { set: 'pc', order: 0 }, c: 1, a: 'gm-a' };
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

const REJECTED_CASES: AdmissionCase[] = TYPES.flatMap((type) =>
  SENDERS.flatMap((sender) =>
    RELATIONS.flatMap((relation) =>
      ADMITTED.has(`${type} ${sender} ${relation}`) ? [] : [[type, sender, relation] as const],
    ),
  ),
);

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

function event(data: JsonValue, connectionId = 'sender') {
  return { data, connectionId };
}

function generationFor(relation: GenerationRelation): Generation {
  return { n: relation === 'lower' ? 0 : relation === 'equal' ? 1 : 2, a: '' };
}

function messageFor(type: RoomMessageType, g: Generation, request = 'request'): JsonValue {
  switch (type) {
    case 'commit':
      return { v: 3, g, t: 'commit', records: [RECORD] };
    case 'propose':
      return { v: 3, g, t: 'propose', records: [RECORD] };
    case 'reject':
      return { v: 3, g, t: 'reject', k: RECORD.k, c: RECORD.c, a: RECORD.a, reason: 'denied' };
    case 'ping':
      return { v: 3, g, t: 'ping' };
    case 'alive':
      return { v: 3, g, t: 'alive', digest: 1 };
    case 'state-request':
      return { v: 3, g, t: 'state-request', r: request };
    case 'state':
      return {
        v: 3,
        g,
        t: 'state',
        r: request,
        i: 1,
        n: 1,
        records: encodeStateRecords([RECORD]),
      };
    case 'reset':
      return { v: 3, g, t: 'reset' };
    case 'roll':
      return {
        v: 3,
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

  test.each(REJECTED_CASES)(
    '%s from %s with a %s generation has no handler effect',
    async (type, sender, relation) => {
      // #given
      const effects: string[] = [];
      const protocol = createRoomProtocol(createPorts(effects, async () => senderFor(sender)));

      // #when
      protocol.receive(event(messageFor(type, generationFor(relation))));
      await settleIngress();

      // #then
      expect(effects).toEqual([]);
    },
  );
});
