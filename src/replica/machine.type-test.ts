import type { TransitionTable } from '@/replica/machine';

type Phase = { readonly kind: 'idle' } | { readonly kind: 'active' };

type Event = { readonly kind: 'start' } | { readonly kind: 'stop' };

type Effect = { readonly type: 'changed' };

export const incompleteTable: TransitionTable<Phase, Event, Effect> = {
  idle: { start: 'ignore', stop: 'ignore' },
  // @ts-expect-error A transition table needs every event cell for every phase row.
  active: { start: 'ignore' },
};
