import { atom, type ReadableAtom } from 'nanostores';

import { sameItemIds } from '@/core/token-selection';
import type { ScenePort, SelectionPort, Unsubscribe } from '@/platform/ports';

// CAP-32: what the window knows of the map: this client's selection, and the item ids of the open
// scene, empty while no scene is ready. Each atom changes only when its ids do, so a drag on the
// map, which Owlbear reports as an item list, renders nothing.
export type MapSelection = {
  $selection: ReadableAtom<ReadonlySet<string>>;
  $sceneItems: ReadableAtom<ReadonlySet<string>>;
  stop: () => void;
};

export type MapScene = Pick<
  ScenePort,
  'isReady' | 'onReadyChange' | 'getItemIds' | 'onItemsChange'
>;

// A read that a callback overtook is dropped, as the callback is newer. A failed read is logged and
// leaves the ids as they were; the next change brings them.
export function watchMapSelection(selection: SelectionPort, scene: MapScene): MapSelection {
  const $selection = atom<ReadonlySet<string>>(new Set());
  const $sceneItems = atom<ReadonlySet<string>>(new Set());
  // Counts the changes each part has heard, so a read that one of them overtook is dropped.
  let selectionChanges = 0;
  let sceneChanges = 0;
  let stopped = false;

  function put(store: typeof $selection, itemIds: readonly string[]): void {
    if (!stopped && !sameItemIds([...store.get()], itemIds)) {
      store.set(new Set(itemIds));
    }
  }

  function readSceneItems(): void {
    const started = sceneChanges;

    scene.getItemIds().then(
      (itemIds) => {
        if (started === sceneChanges) {
          put($sceneItems, itemIds);
        }
      },
      (error) => {
        console.error('Muster Roll could not read the scene items', error);
      },
    );
  }

  const unsubscribes: Unsubscribe[] = [
    selection.onChange((itemIds) => {
      selectionChanges += 1;
      put($selection, itemIds);
    }),
    scene.onReadyChange((ready) => {
      sceneChanges += 1;

      if (ready) {
        readSceneItems();
      } else {
        put($sceneItems, []);
      }
    }),
    // Owlbear reports items only for a ready scene.
    scene.onItemsChange((itemIds) => {
      sceneChanges += 1;
      put($sceneItems, itemIds);
    }),
  ];

  const selectionStarted = selectionChanges;

  selection.getSelection().then(
    (itemIds) => {
      if (selectionStarted === selectionChanges) {
        put($selection, itemIds);
      }
    },
    (error) => {
      console.error('Muster Roll could not read the map selection', error);
    },
  );

  const sceneStarted = sceneChanges;

  scene.isReady().then(
    (ready) => {
      if (ready && sceneStarted === sceneChanges) {
        readSceneItems();
      }
    },
    (error) => {
      console.error('Muster Roll could not read whether the scene is ready', error);
    },
  );

  return {
    $selection,
    $sceneItems,
    stop: () => {
      stopped = true;

      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    },
  };
}
