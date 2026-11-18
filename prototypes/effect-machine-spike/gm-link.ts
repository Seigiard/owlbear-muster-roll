import type { TransitionTable } from './machine';

export type Phase =
  | { kind: 'initializing' }
  | { kind: 'live'; gmLink: 'online' | 'offline' }
  | { kind: 'catching-up'; nonce: string };

export type Event =
  | { kind: 'start' }
  | { kind: 'gm-heard' }
  | { kind: 'silence' }
  | { kind: 'answered'; nonce: string };

export type Effect =
  | { kind: 'arm'; timer: 'gm-silence'; delayMs: number }
  | { kind: 'request'; nonce: string }
  | { kind: 'show' };

export const gmLink: TransitionTable<Phase, Event, Effect> = {
  initializing: {
    start: () => ({ phase: { kind: 'catching-up', nonce: 'r1' }, effects: [{ kind: 'request', nonce: 'r1' }] }),
    'gm-heard': 'ignore',
    silence: 'ignore',
    answered: 'ignore',
  },
  'catching-up': {
    start: 'ignore',
    'gm-heard': (phase) => ({ phase, effects: [{ kind: 'arm', timer: 'gm-silence', delayMs: 20000 }] }),
    silence: 'ignore',
    answered: (phase, event) =>
      event.nonce === phase.nonce
        ? { phase: { kind: 'live', gmLink: 'online' }, effects: [{ kind: 'show' }] }
        : { phase, effects: [] },
  },
  live: {
    start: 'ignore',
    'gm-heard': () => ({ phase: { kind: 'live', gmLink: 'online' }, effects: [{ kind: 'arm', timer: 'gm-silence', delayMs: 20000 }] }),
    silence: () => ({ phase: { kind: 'live', gmLink: 'offline' }, effects: [{ kind: 'show' }] }),
    // answered: deliberately missing -> must be a type error (see incomplete.ts)
    answered: 'ignore',
  },
};
