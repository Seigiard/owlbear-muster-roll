import { SCENE_READ_RETRY_MS } from '@/core/timing';
import { removedItemIds } from '@/core/token-links';
import type { ScenePort } from '@/platform/ports';
import { MessageRejectedFailure, type FailureReporter } from '@/replica/failures';

export type SceneWatch = { stop: () => void };

export type SceneWatchHandlers = {
  report?: FailureReporter;
  // Item ids that left the ready scene, once the scene answered that it is still ready.
  removed: (itemIds: string[]) => void;
  // Every item list of the ready scene, the first one of each ready period included.
  present: (itemIds: ReadonlySet<string>) => void;
};

// Reports the item ids that leave the scene while it stays open, so a GM client can unlink the
// tokens deleted from it. A removal counts only between two item lists of one ready period: a
// scene that is not ready, that closes or that changes to another one says nothing about deleted
// tokens, and a token this client never saw in the open scene is never reported. A failed read is
// tried again after `retryMs` while the scene stays as it was.
export function watchSceneRemovals(
  scene: ScenePort,
  handlers: SceneWatchHandlers,
  retryMs = SCENE_READ_RETRY_MS,
): SceneWatch {
  const reportFailure = handlers.report ?? (() => undefined);
  let stopped = false;
  let ready = false;
  // Counts readiness changes, so a read or a check that one of them overtook is dropped.
  let period = 0;
  // The last item list of this period, or `null` until one arrives.
  let seen: Set<string> | null = null;
  // Removed ids that wait for the scene to answer that it is still ready.
  const waiting = new Set<string>();
  let asking = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  function later(task: () => void): void {
    const timer = setTimeout(() => {
      timers.delete(timer);

      if (!stopped) {
        task();
      }
    }, retryMs);

    timers.add(timer);
  }

  function readReady(): void {
    scene.isReady().then(
      (nowReady) => {
        // A readiness change that came first is newer than this read.
        if (!stopped && period === 0) {
          startPeriod(nowReady);
        }
      },
      (error) => {
        reportFailure(new MessageRejectedFailure({ reason: String(error) }));

        if (period === 0) {
          later(readReady);
        }
      },
    );
  }

  function startPeriod(nowReady: boolean): void {
    period += 1;
    ready = nowReady;
    seen = null;
    waiting.clear();

    if (nowReady) {
      readBaseline(period);
    }
  }

  function readBaseline(started: number): void {
    scene.getItemIds().then(
      (itemIds) => {
        // A list the change callback already brought is newer than this read can be.
        if (!stopped && started === period && seen === null) {
          see(new Set(itemIds));
        }
      },
      (error) => {
        reportFailure(new MessageRejectedFailure({ reason: String(error) }));

        if (started === period && seen === null) {
          later(() => {
            readBaseline(started);
          });
        }
      },
    );
  }

  function see(itemIds: Set<string>): void {
    seen = itemIds;
    handlers.present(itemIds);
  }

  // Owlbear calls back on every item update, a drag included, so most lists remove nothing.
  function followItems(itemIds: string[]): void {
    if (stopped || !ready) {
      return;
    }

    const next = new Set(itemIds);
    const previous = seen;

    for (const itemId of waiting) {
      if (next.has(itemId)) {
        waiting.delete(itemId);
      }
    }

    see(next);

    // A scene switch Owlbear did not report as a readiness change: the new list shares no item with
    // the old one, so it is a new baseline instead of the removal of every item.
    if (previous === null || unrelated(previous, next)) {
      return;
    }

    for (const itemId of removedItemIds(previous, next)) {
      waiting.add(itemId);
    }

    confirm();
  }

  // Owlbear may report a closing scene's empty list before it reports the scene not ready, so the
  // scene must still be ready, in the same period, after the list arrived. Only the ids that waited
  // when the question went out count, so a later list waits for its own answer.
  function confirm(): void {
    if (stopped || asking || waiting.size === 0) {
      return;
    }

    asking = true;

    const asked = [...waiting];
    const checked = period;

    scene.isReady().then(
      (stillReady) => {
        asking = false;

        if (stopped) {
          return;
        }

        if (checked === period && stillReady) {
          report(asked);
        } else if (checked === period) {
          waiting.clear();
        }

        confirm();
      },
      (error) => {
        asking = false;
        reportFailure(new MessageRejectedFailure({ reason: String(error) }));
        // The removal keeps waiting, and the scene is asked again.
        later(confirm);
      },
    );
  }

  function report(asked: readonly string[]): void {
    const removed: string[] = [];

    for (const itemId of asked) {
      if (waiting.has(itemId)) {
        waiting.delete(itemId);
        removed.push(itemId);
      }
    }

    if (removed.length > 0) {
      handlers.removed(removed);
    }
  }

  const unsubscribeReady = scene.onReadyChange((nowReady) => {
    // Owlbear can report the same readiness again, which starts no new period.
    if (!stopped && (period === 0 || nowReady !== ready)) {
      startPeriod(nowReady);
    }
  });

  const unsubscribeItems = scene.onItemsChange(followItems);

  readReady();

  return {
    stop: () => {
      stopped = true;
      unsubscribeReady();
      unsubscribeItems();

      for (const timer of timers) {
        clearTimeout(timer);
      }

      timers.clear();
    },
  };
}

// Two lists with items, none of them shared.
function unrelated(previous: ReadonlySet<string>, next: ReadonlySet<string>): boolean {
  if (previous.size === 0 || next.size === 0) {
    return false;
  }

  for (const itemId of next) {
    if (previous.has(itemId)) {
      return false;
    }
  }

  return true;
}
