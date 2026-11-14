import { cva } from 'class-variance-authority';
import type { ReactNode, Ref } from 'react';

import { Pressable } from './button';

const CHIP_CLASS = cva('', {
  variants: {
    variant: {
      status:
        'touch-target-compact inline-flex items-center rounded-full border border-hairline bg-fill px-2 text-caption text-text-muted',
      default:
        'touch-target-compact rounded-full border border-hairline bg-fill px-2 text-caption text-text-muted data-hovered:bg-fill-strong data-hovered:text-text',
      pressed:
        'touch-target-compact rounded-full border border-accent/40 bg-accent-soft px-2 text-caption text-accent-ink',
    },
  },
});

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
    return <span className={CHIP_CLASS({ variant: 'status' })}>{children}</span>;
  }

  const chipVariant = pressed ? 'pressed' : 'default';

  return (
    <Pressable
      ref={ref}
      className={CHIP_CLASS({ variant: chipVariant })}
      onPress={onPress}
      disabledReason={disabledReason}
      expanded={expanded}
      controls={controls}
    >
      {children}
    </Pressable>
  );
}
