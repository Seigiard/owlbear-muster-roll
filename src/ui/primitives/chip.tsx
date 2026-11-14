import type { ReactNode, Ref } from 'react';

import { Pressable } from './button';

const CHIP_CLASS = 'touch-target rounded-full border px-2 text-label-sm';

type StatusChipProps = {
  children: ReactNode;
  onPress?: undefined;
  disabledReason?: undefined;
  pressed?: undefined;
  expanded?: undefined;
  controls?: undefined;
  ref?: undefined;
};

// `pressed` shows a toggle chip on. `expanded` and `controls` name the panel the chip shows.
type PressableChipProps = {
  children: ReactNode;
  onPress: () => void;
  disabledReason?: string;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  ref?: Ref<HTMLButtonElement>;
};

export function Chip({
  children,
  onPress,
  disabledReason,
  pressed = false,
  expanded,
  controls,
  ref,
}: StatusChipProps | PressableChipProps): ReactNode {
  if (onPress === undefined) {
    return (
      <span className={`inline-flex items-center border-line text-text-muted ${CHIP_CLASS}`}>
        {children}
      </span>
    );
  }

  return (
    <Pressable
      ref={ref}
      className={`${CHIP_CLASS} ${pressed ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-text data-hovered:bg-fill'}`}
      onPress={onPress}
      disabledReason={disabledReason}
      expanded={expanded}
      controls={controls}
    >
      {children}
    </Pressable>
  );
}
