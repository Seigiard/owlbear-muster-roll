import { describe, expect, test } from 'bun:test';
import { createMockPlatform } from '@/platform/current';
import type { ScenePort } from '@/platform/ports';
import { watchSceneRemovals, type SceneWatch } from '@/replica/scene-watch';

const RETRY_MS = 5;

// What a watch reported: each removal, and each list it saw.
type Watched = {
  removed: string[][];
  present: string[][];
  watch: SceneWatch;
};

describe('watchSceneRemovals', () => {
  test('reports the items that leave the ready scene, and every list it sees', async () => {
    // #given
    const platform = createMockPlatform();
    platform.setSceneItems(['t1', 't2', 't3']);
    const watched = watch(platform.scene);
    await settle();
    // #when
    platform.removeSceneItems(['t1', 't3']);
    await settle();
    // #then
    expect({ removed: watched.removed, present: watched.present }).toEqual({
      removed: [['t1', 't3']],
      present: [['t1', 't2', 't3'], ['t2']],
    });
  });
  test('reports nothing when the scene changes to another one and back, step by step', async () => {
    // #given: scene A.
    const platform = createMockPlatform();
    platform.setSceneItems(['t1', 't2']);
    const watched = watch(platform.scene);
    await settle();

    // #when: scene B, then scene A again, each step on its own.
    for (const step of [
      () => platform.setSceneReady(false),
      () => platform.setSceneItems(['b1']),
      () => platform.setSceneReady(true),
      () => platform.setSceneReady(false),
      () => platform.setSceneItems(['t1', 't2']),
      () => platform.setSceneReady(true),
    ]) {
      step();
      // Steps run one after another, so each awaits its turn.
      // oxlint-disable-next-line no-await-in-loop
      await settle();
    }

    platform.removeSceneItems(['t2']);
    await settle();
    // #then: each scene's list is a baseline, and only the deletion after counts.
    expect(watched.removed).toEqual([['t2']]);
  });
  test('keeps its list when Owlbear reports the ready scene ready again', async () => {
    // #given
    const platform = createMockPlatform();
    platform.setSceneItems(['t1', 't2']);
    const watched = watch(platform.scene);
    await settle();
    // #when: the list comes before a new first read could answer.
    platform.setSceneReady(true);
    platform.removeSceneItems(['t1']);
    await settle();
    // #then
    expect(watched.removed).toEqual([['t1']]);
  });
  test('takes a list that shares no item with the last one as another scene, not as a deletion', async () => {
    // #given
    const platform = createMockPlatform();
    platform.setSceneItems(['t1', 't2']);
    const watched = watch(platform.scene);
    await settle();
    // #when: the scene switched with no readiness change.
    platform.setSceneItems(['b1', 'b2']);
    await settle();
    platform.removeSceneItems(['b1']);
    await settle();
    // #then
    expect(watched.removed).toEqual([['b1']]);
  });
  test('reports nothing for a closing scene that empties its list just before it is not ready', async () => {
    // #given
    const platform = createMockPlatform();
    platform.setSceneItems(['t1']);
    const watched = watch(platform.scene);
    await settle();
    // #when
    platform.setSceneItems([]);
    platform.setSceneReady(false);
    await settle();
    // #then
    expect(watched.removed).toEqual([]);
  });
  test('reports nothing when the scene says it is no longer ready once the list arrived', async () => {
    // #given: Owlbear sends the empty list, and has closed the scene by the time it is asked.
    const scene = createFakeScene(['t1']);
    const watched = watch(scene.port);
    await settle();
    // #when
    scene.readyAnswer = false;
    scene.emitItems([]);
    await settle();
    // #then
    expect(watched.removed).toEqual([]);
  });
  test('takes a list that arrives before the first read as the baseline, and ignores the older read', async () => {
    // #given: the first read answers with a list older than the change that came before it.
    const scene = createFakeScene(['t1', 't2']);
    scene.holdReads = true;
    const watched = watch(scene.port);
    await settle();
    // #when
    scene.emitItems(['t1', 't2', 't3']);
    scene.releaseReads(['t1']);
    await settle();
    scene.emitItems(['t1', 't2']);
    await settle();
    // #then
    expect(watched.removed).toEqual([['t3']]);
  });
  test('tries a failed readiness read again', async () => {
    // #given
    const scene = createFakeScene(['t1', 't2']);
    scene.readyFailures = 1;
    const watched = watch(scene.port);
    await pause(RETRY_MS * 4);
    // #when
    scene.emitItems(['t2']);
    await settle();
    // #then
    expect(watched.removed).toEqual([['t1']]);
  });
  test('tries a failed item read again, so the list it brings is the baseline', async () => {
    // #given
    const scene = createFakeScene(['t1', 't2']);
    scene.itemFailures = 1;
    const watched = watch(scene.port);
    await pause(RETRY_MS * 4);
    // #when
    scene.emitItems(['t2']);
    await settle();
    // #then
    expect(watched.removed).toEqual([['t1']]);
  });
  test('keeps a removal waiting when the readiness check fails, and reports it after a retry', async () => {
    // #given
    const scene = createFakeScene(['t1', 't2']);
    const watched = watch(scene.port);
    await settle();
    scene.readyFailures = 1;
    // #when
    scene.emitItems(['t2']);
    await settle();
    const afterFailure = [...watched.removed];
    await pause(RETRY_MS * 4);
    // #then
    expect({ afterFailure, removed: watched.removed }).toEqual({
      afterFailure: [],
      removed: [['t1']],
    });
  });
  test('reports nothing after stop', async () => {
    // #given
    const platform = createMockPlatform();
    platform.setSceneItems(['t1']);
    const watched = watch(platform.scene);
    await settle();
    // #when
    watched.watch.stop();
    platform.removeSceneItems(['t1']);
    await settle();
    // #then
    expect(watched.removed).toEqual([]);
  });
});

function watch(scene: ScenePort): Watched {
  const removed: string[][] = [];
  const present: string[][] = [];

  const sceneWatch = watchSceneRemovals(
    scene,
    {
      removed: (itemIds) => {
        removed.push(itemIds);
      },
      present: (itemIds) => {
        present.push([...itemIds]);
      },
    },
    RETRY_MS,
  );

  return { removed, present, watch: sceneWatch };
}

type FakeScene = {
  port: ScenePort;
  readyAnswer: boolean;
  // How many of the next readiness and item reads reject.
  readyFailures: number;
  itemFailures: number;
  holdReads: boolean;
  emitItems: (itemIds: string[]) => void;
  // Answers every held item read with this list.
  releaseReads: (itemIds: string[]) => void;
};

// A scene port whose answers the test sets, apart from the changes it sends. It stays ready.
function createFakeScene(itemIds: string[]): FakeScene {
  const itemListeners = new Set<(itemIds: string[]) => void>();
  const heldReads: ((itemIds: string[]) => void)[] = [];

  const fake: FakeScene = {
    readyAnswer: true,
    readyFailures: 0,
    itemFailures: 0,
    holdReads: false,
    port: {
      isReady: () => {
        if (fake.readyFailures > 0) {
          fake.readyFailures -= 1;

          return Promise.reject(new Error('fake readiness read failed'));
        }

        return Promise.resolve(fake.readyAnswer);
      },
      onReadyChange: () => () => undefined,
      getItemIds: () => {
        if (fake.itemFailures > 0) {
          fake.itemFailures -= 1;

          return Promise.reject(new Error('fake item read failed'));
        }

        return fake.holdReads
          ? new Promise((resolve) => {
              heldReads.push(resolve);
            })
          : Promise.resolve([...itemIds]);
      },
      onItemsChange: (callback) => {
        itemListeners.add(callback);

        return () => {
          itemListeners.delete(callback);
        };
      },
      // The watch never reads or sets a label.
      getItemLabel: () => Promise.reject(new Error('the scene watch read a label')),
      setItemLabel: () => Promise.reject(new Error('the scene watch set a label')),
    },
    emitItems: (next) => {
      for (const listener of itemListeners) {
        listener([...next]);
      }
    },
    releaseReads: (answer) => {
      for (const resolve of heldReads.splice(0)) {
        resolve([...answer]);
      }
    },
  };

  return fake;
}

function settle(): Promise<void> {
  return pause(0);
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
