import { describe, expect, test } from 'bun:test';

import { createMockPlatform } from '@/platform/current';

import { watchMapSelection } from './map-selection';

describe('watchMapSelection', () => {
  test('starts from the selection and the items of the open scene', async () => {
    // #given
    const platform = createMockPlatform();

    platform.addSceneItems(['t1', 't2']);
    platform.setMapSelection(['t1']);

    // #when
    const watch = watchMapSelection(platform.selection, platform.scene);

    await settle();

    // #then
    expect({
      selection: [...watch.$selection.get()],
      scene: [...watch.$sceneItems.get()],
    }).toEqual({ selection: ['t1'], scene: ['t1', 't2'] });
  });

  test('follows a new selection, a closed scene and a reopened one', async () => {
    // #given
    const platform = createMockPlatform();

    platform.addSceneItems(['t1']);

    const watch = watchMapSelection(platform.selection, platform.scene);

    await settle();

    // #when
    platform.setMapSelection(['t1']);
    platform.setSceneReady(false);

    const whileClosed = [...watch.$sceneItems.get()];

    platform.setSceneReady(true);
    await settle();

    // #then
    expect({
      selection: [...watch.$selection.get()],
      whileClosed,
      reopened: [...watch.$sceneItems.get()],
    }).toEqual({ selection: ['t1'], whileClosed: [], reopened: ['t1'] });
  });

  test('an item update that keeps the same ids changes nothing', async () => {
    // #given: a drag on the map, which Owlbear reports as the same item list.
    const platform = createMockPlatform();

    platform.addSceneItems(['t1']);

    const watch = watchMapSelection(platform.selection, platform.scene);

    await settle();

    const before = watch.$sceneItems.get();

    // #when
    platform.setSceneItems(['t1']);

    // #then
    expect(watch.$sceneItems.get()).toBe(before);
  });

  test('stops following once stopped', async () => {
    // #given
    const platform = createMockPlatform();
    const watch = watchMapSelection(platform.selection, platform.scene);

    await settle();

    // #when
    watch.stop();
    platform.setMapSelection(['t1']);

    // #then
    expect([...watch.$selection.get()]).toEqual([]);
  });
});

// The mock answers reads with resolved promises, so two turns of the queue land them.
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
