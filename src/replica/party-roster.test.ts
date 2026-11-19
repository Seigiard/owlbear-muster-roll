import { afterEach, describe, expect, mock, test } from 'bun:test';
import { Result } from 'better-result';
import { PartyReadFailure, type PartyMember, type PartyPort } from '@/platform/ports';
import { createPartyRoster } from '@/replica/party-roster';

type FakeParty = PartyPort & {
  players: PartyMember[];
  reads: number;
  failReads: boolean;
  // While true, a read answers only on `releaseReads`, with the list it saw when it started.
  holdReads: boolean;
  releaseReads: () => void;
  change: (players: PartyMember[]) => void;
};

afterEach(() => {
  mock.restore();
});

function createFakeParty(players: PartyMember[] = []): FakeParty {
  const listeners = new Set<(players: PartyMember[]) => void>();
  const held: (() => void)[] = [];

  const party: FakeParty = {
    players,
    reads: 0,
    failReads: false,
    holdReads: false,
    releaseReads: () => {
      for (const release of held.splice(0)) {
        release();
      }
    },
    getPlayers: () => {
      party.reads += 1;

      if (party.failReads) {
        return Promise.resolve(Result.err(new PartyReadFailure({ reason: 'party read failed' })));
      }

      const seen = [...party.players];

      if (!party.holdReads) {
        return Promise.resolve(Result.ok(seen));
      }

      return new Promise((resolve) => {
        held.push(() => {
          resolve(Result.ok(seen));
        });
      });
    },
    onChange: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    change: (next) => {
      party.players = next;

      for (const listener of listeners) {
        listener(next);
      }
    },
  };

  return party;
}

function member(connectionId: string, role: PartyMember['role'], id = 'player'): PartyMember {
  return { id, connectionId, name: connectionId, role };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('party roster', () => {
  test('maps a known connection id to its role and player id with no read of its own', async () => {
    // #given
    const party = createFakeParty([member('gm-b', 'GM', 'owner')]);

    const roster = createPartyRoster({
      ...party,
      report: () => {},
      signal: new AbortController().signal,
    });

    await settled();
    const readsBefore = party.reads;
    // #when
    const sender = await roster.senderOf('gm-b');
    // #then
    expect({ sender, extraReads: party.reads - readsBefore }).toEqual({
      sender: { role: 'GM', playerId: 'owner', name: 'gm-b' },
      extraReads: 0,
    });
  });
  test('re-reads the party once on a miss and finds a sender that joined since', async () => {
    // #given
    const party = createFakeParty();

    const roster = createPartyRoster({
      ...party,
      report: () => {},
      signal: new AbortController().signal,
    });

    await settled();
    party.players = [member('late', 'PLAYER', 'lisa')];
    const readsBefore = party.reads;
    // #when
    const sender = await roster.senderOf('late');
    // #then
    expect({ sender, extraReads: party.reads - readsBefore }).toEqual({
      sender: { role: 'PLAYER', playerId: 'lisa', name: 'late' },
      extraReads: 1,
    });
  });
  test('returns null for a sender still missing after the one re-read', async () => {
    // #given
    const party = createFakeParty([member('gm-b', 'GM')]);

    const roster = createPartyRoster({
      ...party,
      report: () => {},
      signal: new AbortController().signal,
    });

    await settled();
    const readsBefore = party.reads;
    // #when
    const sender = await roster.senderOf('stranger');
    // #then
    expect({ sender, extraReads: party.reads - readsBefore }).toEqual({
      sender: null,
      extraReads: 1,
    });
  });
  test('follows a party change, so a member who left is no longer known', async () => {
    // #given
    const party = createFakeParty([member('gm-b', 'GM')]);

    const roster = createPartyRoster({
      ...party,
      report: () => {},
      signal: new AbortController().signal,
    });

    await settled();
    // #when
    party.change([member('gm-c', 'GM')]);
    // #then
    expect({ left: await roster.senderOf('gm-b'), joined: await roster.senderOf('gm-c') }).toEqual({
      left: null,
      joined: { role: 'GM', playerId: 'player', name: 'gm-c' },
    });
  });
  test('takes a role change from a party change', async () => {
    // #given
    const party = createFakeParty([member('gm-b', 'GM')]);

    const roster = createPartyRoster({
      ...party,
      report: () => {},
      signal: new AbortController().signal,
    });

    await settled();
    // #when
    party.change([member('gm-b', 'PLAYER')]);
    // #then
    expect(await roster.senderOf('gm-b')).toEqual({
      role: 'PLAYER',
      playerId: 'player',
      name: 'gm-b',
    });
  });
  test('keeps a party change over a read that started before it', async () => {
    // #given: the start read sees gm-b as a GM and answers only after the demotion.
    const party = createFakeParty([member('gm-b', 'GM')]);
    party.holdReads = true;

    const roster = createPartyRoster({
      ...party,
      report: () => {},
      signal: new AbortController().signal,
    });

    party.change([member('gm-b', 'PLAYER')]);
    // #when
    party.releaseReads();
    await settled();
    // #then
    expect(await roster.senderOf('gm-b')).toEqual({
      role: 'PLAYER',
      playerId: 'player',
      name: 'gm-b',
    });
  });
  test('applies a read that started after the last party change', async () => {
    // #given: the party changed, and then a member joined with no change event yet.
    const party = createFakeParty();

    const roster = createPartyRoster({
      ...party,
      report: () => {},
      signal: new AbortController().signal,
    });

    await settled();
    party.change([member('gm-b', 'GM')]);
    party.players = [member('gm-b', 'GM'), member('late', 'GM')];
    // #when
    const sender = await roster.senderOf('late');
    // #then
    expect(sender).toEqual({ role: 'GM', playerId: 'player', name: 'late' });
  });
  test('shares one read among misses that come while it is on its way', async () => {
    // #given
    const party = createFakeParty();

    const roster = createPartyRoster({
      ...party,
      report: () => {},
      signal: new AbortController().signal,
    });

    await settled();
    party.holdReads = true;
    party.players = [member('late', 'GM')];
    const readsBefore = party.reads;

    // #when
    const senders = Promise.all([
      roster.senderOf('late'),
      roster.senderOf('late'),
      roster.senderOf('stranger'),
    ]);

    await settled();
    party.releaseReads();
    // #then
    expect({ senders: await senders, extraReads: party.reads - readsBefore }).toEqual({
      senders: [
        { role: 'GM', playerId: 'player', name: 'late' },
        { role: 'GM', playerId: 'player', name: 'late' },
        null,
      ],
      extraReads: 1,
    });
  });
  test('returns null and does not throw when the party read fails', async () => {
    // #given
    const party = createFakeParty([member('gm-b', 'GM')]);
    const reported: string[] = [];
    party.failReads = true;

    const roster = createPartyRoster({
      ...party,
      report: (failure: { _tag: string }) => reported.push(failure._tag),
      signal: new AbortController().signal,
    });

    // #when
    const sender = await roster.senderOf('gm-b');

    // #then
    expect({ sender, reported }).toEqual({
      sender: null,
      reported: ['PartyReadFailure'],
    });
  });
  test('stops following party changes once its signal aborts', async () => {
    // #given
    const party = createFakeParty();
    const controller = new AbortController();
    const reported: string[] = [];

    const roster = createPartyRoster({
      ...party,
      report: (failure: { _tag: string }) => reported.push(failure._tag),
      signal: controller.signal,
    });

    await settled();
    controller.abort();
    party.failReads = true;
    // #when
    party.change([member('gm-b', 'GM')]);
    // #then
    expect({ sender: await roster.senderOf('gm-b'), reported }).toEqual({
      sender: null,
      reported: ['PartyReadFailure'],
    });
  });
});
