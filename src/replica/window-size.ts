import type { WindowSize } from '@/core/preset';
import type { ActionPort } from '@/platform/ports';
import { MessageRejectedFailure, type FailureReporter } from '@/replica/failures';

export type WindowSizer = {
  apply: (size: WindowSize) => void;
};

// One request to Owlbear. `wantedAgain`: the same size was asked for while it was in flight.
type SizeRequest = { size: WindowSize; settled: boolean; wantedAgain: boolean };

// TASK-33: the background sizes the action window, so the window has its size before it opens. A
// size equal to the last one asked for in this page's life is not asked for again. A failed request
// is forgotten and `failed` is called, so the caller can ask again. A failed request whose size was
// asked for again while it was in flight is sent again at once.
export function createWindowSizer(
  action: Pick<ActionPort, 'setSize'> & { report?: FailureReporter },
  failed: () => void = () => {},
): WindowSizer {
  const report = action.report ?? (() => undefined);
  let requested: SizeRequest | null = null;

  function send(size: WindowSize): void {
    const request: SizeRequest = { size, settled: false, wantedAgain: false };

    requested = request;

    action.setSize(size.width, size.height).then(
      () => {
        request.settled = true;
      },
      (error) => {
        request.settled = true;
        report(new MessageRejectedFailure({ reason: String(error) }));

        if (requested !== request) {
          return;
        }

        if (request.wantedAgain) {
          send(size);

          return;
        }

        requested = null;
        failed();
      },
    );
  }

  return {
    apply: (size) => {
      if (requested?.size.width === size.width && requested.size.height === size.height) {
        if (!requested.settled) {
          requested.wantedAgain = true;
        }

        return;
      }

      send({ width: size.width, height: size.height });
    },
  };
}
