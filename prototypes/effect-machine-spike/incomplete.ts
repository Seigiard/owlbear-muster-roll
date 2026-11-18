import type { TransitionTable } from './machine';
import type { Phase, Event, Effect } from './gm-link';
export const broken: TransitionTable<Phase, Event, Effect> = {
  initializing: { start: 'ignore', 'gm-heard': 'ignore', silence: 'ignore', answered: 'ignore' },
  'catching-up': { start: 'ignore', 'gm-heard': 'ignore', silence: 'ignore', answered: 'ignore' },
  // @ts-expect-error the `live` row lacks `answered`: completeness is a compile error
  live: { start: 'ignore', 'gm-heard': 'ignore', silence: 'ignore' },
};
