import type { LinkTarget } from '../../src/core/link-target';
import { LINK_PICKER_TIMING, type LinkPickerTiming } from '../../src/core/timing';

import {
  initialState,
  transition,
  type PickerEffect,
  type PickerEvent,
  type PickerFacts,
  type PickerState,
} from './picker-flow';

export type PickerPorts = {
  readLabel: (tokenId: string) => Promise<string | null>;
  link: (tokenId: string, target: LinkTarget) => Promise<'answered' | 'refused' | 'timed-out'>;
  writeLabel: (tokenId: string, label: string) => Promise<void>;
  notifyLabelFailure: () => Promise<void>;
  close: () => Promise<void>;
  schedule: (ms: number, callback: () => void) => () => void;
};

export type PickerCaller = {
  state: () => PickerState;
  facts: (facts: PickerFacts) => void;
  offer: (wanted: boolean) => void;
  pick: (target: LinkTarget, name: string) => void;
  dispose: () => void;
};

export function createPickerCaller(
  tokenId: string,
  ports: PickerPorts,
  timing: LinkPickerTiming = LINK_PICKER_TIMING,
): PickerCaller {
  let state = initialState(tokenId);
  const cancellations = new Set<() => void>();

  function dispatch(event: PickerEvent): void {
    const step = transition(state, event);
    state = step.state;

    for (const effect of step.effects) {
      if (state.disposed || state.closed) {
        break;
      }

      run(effect);
    }
  }

  function run(effect: PickerEffect): void {
    switch (effect.kind) {
      case 'read':
        bounded(
          () => ports.readLabel(tokenId),
          timing.labelReadTimeoutMs,
          (text) => ({ type: 'read', result: { text } }),
          () => ({ type: 'read', result: { failed: true } }),
        );
        break;
      case 'link':
        // The replica client owns command timeouts; a second timer would duplicate that owner.
        invoke(
          () => ports.link(tokenId, effect.target),
          (outcome) => ({ type: 'command', id: effect.id, outcome }),
          () => ({ type: 'command', id: effect.id, outcome: 'failed' }),
        );
        break;
      case 'write':
        bounded(
          () => ports.writeLabel(tokenId, effect.label),
          timing.labelWriteTimeoutMs,
          () => ({ type: 'write', id: effect.id, ok: true }),
          () => ({ type: 'write', id: effect.id, ok: false }),
        );
        break;
      case 'notify':
        bounded(
          () => ports.notifyLabelFailure(),
          timing.labelWriteTimeoutMs,
          () => ({ type: 'notified', id: effect.id }),
          () => ({ type: 'notified', id: effect.id }),
        );
        break;
      case 'close':
        invoke(
          () => ports.close(),
          () => ({ type: 'close', id: effect.id, ok: true }),
          () => ({ type: 'close', id: effect.id, ok: false }),
        );
        break;
    }
  }

  function invoke<Value>(
    work: () => Promise<Value>,
    success: (value: Value) => PickerEvent,
    failure: () => PickerEvent,
  ): void {
    try {
      work().then(
        (value) => dispatch(success(value)),
        () => dispatch(failure()),
      );
    } catch {
      dispatch(failure());
    }
  }

  function bounded<Value>(
    work: () => Promise<Value>,
    ms: number,
    success: (value: Value) => PickerEvent,
    failure: () => PickerEvent,
  ): void {
    let active = true;
    const cancelTimer = ports.schedule(ms, () => settle(failure()));

    const cancel = (): void => {
      active = false;
      cancelTimer();
    };

    cancellations.add(cancel);

    function settle(event: PickerEvent): void {
      if (!active) {
        return;
      }

      cancel();
      cancellations.delete(cancel);
      dispatch(event);
    }

    try {
      work().then(
        (value) => settle(success(value)),
        () => settle(failure()),
      );
    } catch {
      settle(failure());
    }
  }

  return {
    state: () => state,
    facts: (facts) => dispatch({ type: 'facts', facts }),
    offer: (wanted) => dispatch({ type: 'offer', wanted }),
    pick: (target, name) => dispatch({ type: 'pick', target, name }),
    dispose: () => {
      dispatch({ type: 'dispose' });

      for (const cancel of cancellations) {
        cancel();
      }

      cancellations.clear();
    },
  };
}
