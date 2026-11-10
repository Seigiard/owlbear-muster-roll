import type { ReactNode } from 'react';

import { Pressable } from './button';

const CHIP_CLASS = 'touch-target rounded-full border border-line px-2 text-label-sm';

type StatusChipProps = { children: ReactNode; onPress?: undefined; disabledReason?: undefined };

type PressableChipProps = { children: ReactNode; onPress: () => void; disabledReason?: string };

export function Chip({
  children,
  onPress,
  disabledReason,
}: StatusChipProps | PressableChipProps): ReactNode {
  if (onPress === undefined) {
    return (
      <span className={`inline-flex items-center text-text-muted ${CHIP_CLASS}`}>{children}</span>
    );
  }

  return (
    <Pressable
      className={`text-text ${CHIP_CLASS}`}
      onPress={onPress}
      disabledReason={disabledReason}
    >
      {children}
    </Pressable>
  );
}
