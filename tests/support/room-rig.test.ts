import { expect, test } from 'bun:test';
import { createRoomRig } from './room-rig';

test('manual time runs due timers in order without real waiting', async () => {
  // #given
  const rig = createRoomRig({ clock: 'manual' });
  const room = rig.openRoom();
  const first = rig.createClient(room, 'first');
  const second = rig.createClient(room, 'second');
  const signal = new AbortController().signal;
  const epoch = first.platform.clock.now();
  const calls: [string, number][] = [];

  const record = (name: string, now: () => number): void => {
    calls.push([name, now() - epoch]);
  };

  const firstClock = first.platform.clock;
  const secondClock = second.platform.clock;
  firstClock.schedule(signal, 30, () => record('third', firstClock.now));
  firstClock.schedule(signal, 10, () => record('first', firstClock.now));
  secondClock.schedule(signal, 10, () => record('second', secondClock.now));
  const cancel = secondClock.schedule(signal, 20, () => record('cancelled', secondClock.now));
  cancel();

  // #when
  await rig.advance(15);
  calls.push(['after 15', secondClock.now() - epoch]);
  await rig.advance(20);
  calls.push(['after 35', firstClock.now() - epoch]);
  firstClock.schedule(signal, 10000, () => record('long', firstClock.now));
  const started = performance.now();
  await rig.advance(10000);
  const elapsed = performance.now() - started;

  // #then
  expect(calls).toEqual([
    ['first', 10],
    ['second', 10],
    ['after 15', 15],
    ['third', 30],
    ['after 35', 35],
    ['long', 10035],
  ]);
  expect(elapsed).toBeLessThan(100);
});
