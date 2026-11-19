export type Schedule = (signal: AbortSignal, ms: number, fn: () => void) => () => void;

export const schedule: Schedule = (signal, ms, fn) => {
  if (signal.aborted) {
    return () => undefined;
  }

  let active = true;

  const cancel = (): void => {
    if (!active) {
      return;
    }

    active = false;
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  };

  const fire = (): void => {
    if (!active || signal.aborted) {
      return;
    }

    active = false;
    signal.removeEventListener('abort', cancel);
    fn();
  };

  const timer = setTimeout(fire, ms);
  signal.addEventListener('abort', cancel, { once: true });

  return cancel;
};
