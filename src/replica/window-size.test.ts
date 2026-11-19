import { describe, expect, test } from 'bun:test';
import type { WindowSize } from '@/core/preset';
import { createMockPlatform } from '@/platform/current';
import { createWindowSizer } from './window-size';

describe('createWindowSizer', () => {
  test('asks for a size once while it stays the same', () => {
    // #given
    const platform = createMockPlatform();
    const sizer = createWindowSizer(platform.action);
    // #when
    sizer.apply({ width: 900, height: 700 });
    sizer.apply({ width: 900, height: 700 });
    sizer.apply({ width: 600, height: 600 });
    // #then
    expect(platform.actionSizes()).toEqual([
      { width: 900, height: 700 },
      { width: 600, height: 600 },
    ]);
  });
  test.each<[string, WindowSize]>([
    ['the height', { width: 900, height: 800 }],
    ['the width', { width: 1000, height: 700 }],
  ])('asks again when only %s changes', (_name, next) => {
    // #given
    const platform = createMockPlatform();
    const sizer = createWindowSizer(platform.action);
    sizer.apply({ width: 900, height: 700 });
    // #when
    sizer.apply(next);
    // #then
    expect(platform.actionSizes()).toEqual([{ width: 900, height: 700 }, next]);
  });
  test('logs a failed size, reports it, and asks for the same size again next time', async () => {
    // #given
    const platform = createMockPlatform();
    let failures = 0;
    const reported: string[] = [];

    const sizer = createWindowSizer(
      {
        ...platform.action,
        report: (failure: { _tag: string }) => reported.push(failure._tag),
      },
      () => {
        failures += 1;
      },
    );

    platform.failNextActionSize();
    sizer.apply({ width: 900, height: 700 });
    await settle();
    // #when
    sizer.apply({ width: 900, height: 700 });
    // #then
    expect({
      sizes: platform.actionSizes(),
      reported,
      failures,
    }).toEqual({
      sizes: [
        { width: 900, height: 700 },
        { width: 900, height: 700 },
      ],
      reported: ['message-rejected'],
      failures: 1,
    });
  });
  test('sends a size again at once when it failed after the same size was asked for in flight', async () => {
    // #given
    const platform = createMockPlatform();
    let failures = 0;
    const reported: string[] = [];

    const sizer = createWindowSizer(
      {
        ...platform.action,
        report: (failure: { _tag: string }) => reported.push(failure._tag),
      },
      () => {
        failures += 1;
      },
    );

    platform.failNextActionSize();
    sizer.apply({ width: 900, height: 700 });
    // #when
    sizer.apply({ width: 900, height: 700 });
    await settle();
    // #then
    expect({ sizes: platform.actionSizes(), failures, reported }).toEqual({
      sizes: [
        { width: 900, height: 700 },
        { width: 900, height: 700 },
      ],
      failures: 0,
      reported: ['message-rejected'],
    });
  });
});

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
