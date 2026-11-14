import { expect, test } from 'bun:test';

import { createPickerCaller, type PickerPorts } from './picker-caller';
import { canOffer, canPick } from './picker-flow';
import { BLOCK, flush, open, READY, rig, TARGET } from './test-support';

test('read runs once after readiness and blocks picks until it settles', async () => {
  // #given
  const r = rig();
  r.caller.facts({ ...READY, firstCatchUpDone: false });
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts(READY);
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts(READY);
  // #when
  r.reads[0]!.resolve('');
  await flush();
  r.caller.facts(READY);
  r.caller.pick(TARGET, 'Aragorn');
  // #then
  expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-']);
});

test('answer alone cannot write or close; matching arrival freezes the offered name', async () => {
  // #given
  const r = await open();
  r.caller.pick(BLOCK, 'Goblin');
  r.caller.offer(false);
  r.caller.pick(BLOCK, 'Renamed');
  // #when
  r.links[0]!.resolve('answered');
  await flush();
  const beforeArrival = [...r.calls];
  r.caller.facts({ ...READY, arrived: BLOCK });
  r.writes[0]!.resolve();
  await flush();
  r.closes[0]!.resolve();
  await flush();
  // #then
  expect({ beforeArrival, calls: r.calls, closed: r.caller.state().closed }).toEqual({
    beforeArrival: ['read:t1', 'link:t1:npc:gob'],
    calls: ['read:t1', 'link:t1:npc:gob', 'write:t1:Goblin', 'close'],
    closed: true,
  });
});

test.each(['unchecked', 'empty-name', 'existing-label', 'missing-label'])(
  '%s links and closes without writing a label',
  async (scenario) => {
    // #given
    const r = await open(
      scenario === 'existing-label' ? 'Old' : scenario === 'missing-label' ? null : '',
    );

    if (scenario === 'unchecked') {
      r.caller.offer(false);
    }

    // #when
    r.caller.pick(TARGET, scenario === 'empty-name' ? '' : 'Aragorn');
    r.caller.facts({ ...READY, arrived: TARGET });
    // #then
    expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-', 'close']);
  },
);

test('GM can explicitly offer a replacement for an existing label', async () => {
  // #given
  const r = await open('Old');
  r.caller.offer(true);
  // #when
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });
  // #then
  expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn']);
});

test('a missing label cannot be opted in', async () => {
  // #given
  const r = await open(null);
  // #when
  r.caller.offer(true);
  // #then
  expect({ wanted: r.caller.state().wanted, enabled: canOffer(r.caller.state()) }).toEqual({
    wanted: false,
    enabled: false,
  });
});

test.each(['reject', 'timeout'])(
  '%s read permits linking without a default label write',
  async (mode) => {
    // #given
    const r = rig();
    r.caller.facts(READY);

    // #when
    if (mode === 'reject') {
      r.reads[0]!.reject();
      await flush();
    } else {
      r.advance(19);
      expect(canPick(r.caller.state())).toBe(false);
      r.advance(1);
    }

    r.reads[0]!.resolve('');
    await flush();
    r.caller.pick(TARGET, 'Aragorn');
    r.caller.facts({ ...READY, arrived: TARGET });
    // #then
    expect({ calls: r.calls, wanted: r.caller.state().wanted }).toEqual({
      calls: ['read:t1', 'link:t1:arag:-', 'close'],
      wanted: false,
    });
  },
);

test('failed read still permits an explicit label offer', async () => {
  // #given
  const r = rig();
  r.caller.facts(READY);
  r.advance(20);
  // #when
  r.caller.offer(true);
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });
  // #then
  expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn']);
});

test.each(['refused', 'timed-out', 'reject'] as const)(
  '%s command fails without label or close and permits a retry',
  async (outcome) => {
    // #given
    const r = await open();
    r.caller.pick(TARGET, 'Aragorn');

    // #when
    if (outcome === 'reject') {
      r.links[0]!.reject();
    } else {
      r.links[0]!.resolve(outcome);
    }

    await flush();
    const failed = r.caller.state().failed;
    r.caller.pick(TARGET, 'Aragorn');
    // #then
    expect({ calls: r.calls, failed, retryFailed: r.caller.state().failed }).toEqual({
      calls: ['read:t1', 'link:t1:arag:-', 'link:t1:arag:-'],
      failed: true,
      retryFailed: false,
    });
  },
);

test('arrival first survives a late timeout and a relink during the write', async () => {
  // #given
  const r = await open();
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });
  // #when
  r.caller.facts({ ...READY, arrived: BLOCK });
  r.links[0]!.resolve('timed-out');
  await flush();
  r.caller.pick(TARGET, 'Again');
  r.caller.facts({ ...READY, arrived: TARGET });
  r.writes[0]!.resolve();
  await flush();
  // #then
  expect({ calls: r.calls, failed: r.caller.state().failed }).toEqual({
    calls: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'close'],
    failed: false,
  });
});

test.each([
  { phase: 'notifying', calls: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'notify'] },
  { phase: 'closing', calls: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'close'] },
])('arrival first survives a late command timeout while $phase', async ({ phase, calls }) => {
  // #given
  const r = await open();
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });

  if (phase === 'notifying') {
    r.writes[0]!.reject();
  } else {
    r.writes[0]!.resolve();
  }

  await flush();
  // #when
  r.caller.facts({ ...READY, arrived: BLOCK });
  r.links[0]!.resolve('timed-out');
  await flush();

  const pending = {
    id: r.caller.state().attempt?.id,
    phase: r.caller.state().attempt?.phase,
    failed: r.caller.state().failed,
    canPick: canPick(r.caller.state()),
  };

  r.caller.pick(TARGET, 'Again');
  // #then
  expect({ calls: r.calls, pending }).toEqual({
    calls: [...calls],
    pending: { id: 1, phase, failed: false, canPick: false },
  });
});

test.each(['reject', 'timeout'])('%s label write notifies before closing', async (mode) => {
  // #given
  const r = await open();
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });

  // #when
  if (mode === 'reject') {
    r.writes[0]!.reject();
    await flush();
  } else {
    r.advance(49);
    expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn']);
    r.advance(1);
  }

  const beforeNotification = [...r.calls];
  r.notifications[0]!.resolve();
  await flush();
  // #then
  expect({ beforeNotification, calls: r.calls }).toEqual({
    beforeNotification: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'notify'],
    calls: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'notify', 'close'],
  });
});

test.each(['reject', 'timeout'])(
  '%s notification still permits close; late write is inert',
  async (mode) => {
    // #given
    const r = await open();
    r.caller.pick(TARGET, 'Aragorn');
    r.caller.facts({ ...READY, arrived: TARGET });
    r.advance(50);
    // #when
    r.writes[0]!.resolve();
    await flush();

    if (mode === 'reject') {
      r.notifications[0]!.reject();
      await flush();
    } else {
      r.advance(50);
    }

    r.notifications[0]!.resolve();
    await flush();
    // #then
    expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'notify', 'close']);
  },
);

test('notification timeout waits until its deadline before closing', async () => {
  // #given
  const r = await open();
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });
  r.writes[0]!.reject();
  await flush();
  // #when
  r.advance(49);

  const beforeDeadline = {
    calls: [...r.calls],
    timers: r.pendingTimers(),
    phase: r.caller.state().attempt?.phase,
  };

  r.advance(1);
  // #then
  expect({ beforeDeadline, calls: r.calls, timers: r.pendingTimers() }).toEqual({
    beforeDeadline: {
      calls: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'notify'],
      timers: 1,
      phase: 'notifying',
    },
    calls: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'notify', 'close'],
    timers: 0,
  });
});

test.each([
  { operation: 'read', calls: ['read:t1'] },
  { operation: 'write', calls: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'close'] },
  {
    operation: 'notification',
    calls: ['read:t1', 'link:t1:arag:-', 'write:t1:Aragorn', 'notify', 'close'],
  },
])('normal $operation settlement removes its timer', async ({ operation, calls }) => {
  // #given
  const r = rig();
  r.caller.facts(READY);

  if (operation !== 'read') {
    r.reads[0]!.resolve('');
    await flush();
    r.caller.pick(TARGET, 'Aragorn');
    r.caller.facts({ ...READY, arrived: TARGET });
  }

  if (operation === 'notification') {
    r.writes[0]!.reject();
    await flush();
  }

  const beforeTimers = r.pendingTimers();

  // #when
  if (operation === 'read') {
    r.reads[0]!.resolve('');
  } else if (operation === 'write') {
    r.writes[0]!.resolve();
  } else {
    r.notifications[0]!.resolve();
  }

  await flush();
  const afterTimers = r.pendingTimers();
  r.advance(1000);
  // #then
  expect({ beforeTimers, afterTimers, calls: r.calls }).toEqual({
    beforeTimers: 1,
    afterTimers: 0,
    calls: [...calls],
  });
});

test('player cannot start a read or a pick', () => {
  // #given
  const r = rig();
  // #when
  r.caller.facts({ ...READY, role: 'PLAYER' });
  r.caller.offer(true);
  r.caller.pick(TARGET, 'Aragorn');
  // #then
  expect(r.calls).toEqual([]);
});

test('demotion before arrival skips label write and closes', async () => {
  // #given
  const r = await open();
  r.caller.pick(TARGET, 'Aragorn');
  // #when
  r.caller.facts({ ...READY, role: 'PLAYER', arrived: TARGET });
  // #then
  expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-', 'close']);
});

test('demotion during the initial read still blocks a pick', async () => {
  // #given
  const r = rig();
  r.caller.facts(READY);
  r.caller.facts({ ...READY, role: 'PLAYER' });
  // #when
  r.reads[0]!.resolve('');
  await flush();
  r.caller.pick(TARGET, 'Aragorn');
  // #then
  expect(r.calls).toEqual(['read:t1']);
});

test('close failure permits same-target retry and old command failure cannot clear it', async () => {
  // #given
  const r = await open();
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });
  r.writes[0]!.resolve();
  await flush();
  r.closes[0]!.reject();
  await flush();
  r.caller.facts(READY);
  // #when
  r.caller.pick(TARGET, 'Again');
  r.links[0]!.resolve('refused');
  await flush();
  r.caller.facts({ ...READY, arrived: TARGET });
  // #then
  expect(r.calls).toEqual([
    'read:t1',
    'link:t1:arag:-',
    'write:t1:Aragorn',
    'close',
    'link:t1:arag:-',
    'write:t1:Again',
  ]);
});

test.each(['resolve', 'reject'])(
  'late write %s after timeout and close rejection cannot settle a new attempt',
  async (outcome) => {
    // #given
    const r = await open();
    r.caller.pick(TARGET, 'Aragorn');
    r.caller.facts({ ...READY, arrived: TARGET });
    r.advance(50);
    r.notifications[0]!.resolve();
    await flush();
    r.closes[0]!.reject();
    await flush();
    r.caller.pick(TARGET, 'Again');

    // #when
    if (outcome === 'resolve') {
      r.writes[0]!.resolve();
    } else {
      r.writes[0]!.reject();
    }

    await flush();
    r.caller.pick(TARGET, 'Third');
    r.advance(49);

    const pending = {
      calls: [...r.calls],
      id: r.caller.state().attempt?.id,
      phase: r.caller.state().attempt?.phase,
      failed: r.caller.state().failed,
      timers: r.pendingTimers(),
    };

    r.writes[1]!.resolve();
    await flush();
    // #then
    expect({ pending, calls: r.calls, timers: r.pendingTimers() }).toEqual({
      pending: {
        calls: [
          'read:t1',
          'link:t1:arag:-',
          'write:t1:Aragorn',
          'notify',
          'close',
          'link:t1:arag:-',
          'write:t1:Again',
        ],
        id: 2,
        phase: 'writing',
        failed: false,
        timers: 1,
      },
      calls: [
        'read:t1',
        'link:t1:arag:-',
        'write:t1:Aragorn',
        'notify',
        'close',
        'link:t1:arag:-',
        'write:t1:Again',
        'close',
      ],
      timers: 0,
    });
  },
);

test('same-target retry can finish against an already matching replica', async () => {
  // #given
  const r = await open('Old');
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });
  r.closes[0]!.reject();
  await flush();
  // #when
  r.caller.pick(TARGET, 'Aragorn');
  r.links[0]!.resolve('timed-out');
  await flush();
  // #then
  expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-', 'close', 'link:t1:arag:-', 'close']);
});

test('successful close prevents another pick', async () => {
  // #given
  const r = await open('Old');
  r.caller.pick(TARGET, 'Aragorn');
  r.caller.facts({ ...READY, arrived: TARGET });
  r.closes[0]!.resolve();
  await flush();
  // #when
  r.caller.pick(BLOCK, 'Goblin');
  // #then
  expect(r.calls).toEqual(['read:t1', 'link:t1:arag:-', 'close']);
});

test('dispose cancels read timers and drops a late read', async () => {
  // #given
  const r = rig();
  r.caller.facts(READY);
  // #when
  r.caller.dispose();
  r.reads[0]!.resolve('');
  await flush();
  r.advance(100);
  r.caller.pick(TARGET, 'Aragorn');
  // #then
  expect({ calls: r.calls, timers: r.pendingTimers(), label: r.caller.state().label }).toEqual({
    calls: ['read:t1'],
    timers: 0,
    label: { kind: 'reading' },
  });
});

test.each([true, false])(
  'synchronous disposal by link stops the queued effect with offer %j',
  async (wanted) => {
    // #given
    const calls: string[] = [];

    const caller = createPickerCaller('t1', {
      readLabel: () => {
        calls.push('read');

        return Promise.resolve('');
      },
      link: () => {
        calls.push('link');
        caller.dispose();

        return Promise.resolve('answered');
      },
      writeLabel: () => {
        calls.push('write');

        return Promise.resolve();
      },
      notifyLabelFailure: () => {
        calls.push('notify');

        return Promise.resolve();
      },
      close: () => {
        calls.push('close');

        return Promise.resolve();
      },
      schedule: () => () => {},
    });

    caller.facts({ ...READY, arrived: TARGET });
    await flush();
    caller.offer(wanted);
    // #when
    caller.pick(TARGET, 'Aragorn');
    await flush();
    // #then
    expect({ calls, disposed: caller.state().disposed }).toEqual({
      calls: ['read', 'link'],
      disposed: true,
    });
  },
);

test.each(['waiting', 'writing', 'notifying', 'closing'])(
  'dispose during %s prevents later effects',
  async (phase) => {
    // #given
    const r = await open();
    r.caller.pick(TARGET, 'Aragorn');

    if (phase !== 'waiting') {
      r.caller.facts({ ...READY, arrived: TARGET });
    }

    if (phase === 'notifying') {
      r.advance(50);
    }

    if (phase === 'closing') {
      r.writes[0]!.resolve();
      await flush();
    }

    const beforeDispose = [...r.calls];
    // #when
    r.caller.dispose();
    r.caller.dispose();
    r.links[0]!.resolve('timed-out');

    for (const work of [...r.writes, ...r.notifications, ...r.closes]) {
      work.resolve();
    }

    await flush();
    r.advance(1000);
    r.caller.facts({ ...READY, arrived: TARGET });
    // #then
    expect({ calls: r.calls, timers: r.pendingTimers() }).toEqual({
      calls: beforeDispose,
      timers: 0,
    });
  },
);

test('synchronously throwing ports follow read, command, write, notify and close failure paths', () => {
  // #given
  const calls: string[] = [];

  const fail = (name: string): never => {
    calls.push(name);
    throw new Error('synchronous port failure');
  };

  let commandFails = true;

  const ports: PickerPorts = {
    readLabel: () => fail('read'),
    link: () => (commandFails ? fail('link') : Promise.resolve('answered')),
    writeLabel: () => fail('write'),
    notifyLabelFailure: () => fail('notify'),
    close: () => fail('close'),
    schedule: () => () => {},
  };

  const caller = createPickerCaller('t1', ports);
  caller.facts(READY);
  caller.offer(true);
  caller.pick(TARGET, 'Aragorn');
  commandFails = false;
  // #when
  caller.pick(TARGET, 'Aragorn');
  caller.facts({ ...READY, arrived: TARGET });
  // #then
  expect({ calls, retry: canPick(caller.state()) }).toEqual({
    calls: ['read', 'link', 'write', 'notify', 'close'],
    retry: true,
  });
});
