import { afterEach, beforeEach, expect, jest, test } from 'bun:test';
import { schedule } from './timers';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('schedule fires a callback once after its delay', () => {
  // #given
  const controller = new AbortController();
  let calls = 0;

  // #when
  schedule(controller.signal, 10, () => {
    calls += 1;
  });
  jest.advanceTimersByTime(10);

  // #then
  expect(calls).toBe(1);
});

test('schedule cancel prevents the callback from firing', () => {
  // #given
  const controller = new AbortController();
  let calls = 0;

  const cancel = schedule(controller.signal, 10, () => {
    calls += 1;
  });

  // #when
  cancel();
  jest.advanceTimersByTime(10);

  // #then
  expect(calls).toBe(0);
});

test('schedule abort prevents the callback from firing', () => {
  // #given
  const controller = new AbortController();
  let calls = 0;
  schedule(controller.signal, 10, () => {
    calls += 1;
  });

  // #when
  controller.abort();
  jest.advanceTimersByTime(10);

  // #then
  expect(calls).toBe(0);
});

test('schedule does not schedule an already aborted signal', () => {
  // #given
  const controller = new AbortController();
  let calls = 0;
  controller.abort();

  // #when
  const cancel = schedule(controller.signal, 10, () => {
    calls += 1;
  });

  cancel();
  jest.advanceTimersByTime(10);

  // #then
  expect(calls).toBe(0);
});

test('schedule cancellation is a no-op after the callback fires', () => {
  // #given
  const controller = new AbortController();
  let calls = 0;

  const cancel = schedule(controller.signal, 10, () => {
    calls += 1;
  });

  // #when
  jest.advanceTimersByTime(10);
  cancel();
  controller.abort();
  jest.advanceTimersByTime(10);

  // #then
  expect(calls).toBe(1);
});
