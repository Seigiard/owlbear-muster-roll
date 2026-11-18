// A machine is a table: every (phase, event) cell is filled, or the type fails.
export type Tagged<K extends string> = { readonly kind: K };

export type Step<Phase, Effect> = { readonly phase: Phase; readonly effects: readonly Effect[] };

// `ignore` is an explicit answer: the machine saw the event and drops it on purpose.
export type Cell<P, E, Phase, Effect> =
  | 'ignore'
  | ((phase: P, event: E) => Step<Phase, Effect>);

export type TransitionTable<Phase extends Tagged<string>, Event extends Tagged<string>, Effect> = {
  readonly [P in Phase['kind']]: {
    readonly [E in Event['kind']]: Cell<
      Extract<Phase, { kind: P }>,
      Extract<Event, { kind: E }>,
      Phase,
      Effect
    >;
  };
};

export function step<Phase extends Tagged<string>, Event extends Tagged<string>, Effect>(
  table: TransitionTable<Phase, Event, Effect>,
  phase: Phase,
  event: Event,
): Step<Phase, Effect> {
  const row = table[phase.kind as Phase['kind']];
  const cell = row[event.kind as Event['kind']] as Cell<Phase, Event, Phase, Effect>;
  return cell === 'ignore' ? { phase, effects: [] } : cell(phase, event);
}
