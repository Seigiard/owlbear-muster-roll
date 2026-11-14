import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { Pressable, type PressableProps } from './button';
import { CellTooltip } from './tooltip';

// A square header control: muted at rest, lit under the pointer, the tonal accent while pressed.
// The danger tone warns under the pointer only, as the confirmation that follows still guards it.
export const ICON_BUTTON_CLASS =
  'touch-target w-[32px] shrink-0 rounded-md border border-transparent text-text-muted';

// One hover per tone, so two hover fills never compete for the same button.
export const ICON_BUTTON_HOVER_CLASS = 'data-hovered:bg-fill data-hovered:text-text';

const PRESSED_CLASS = 'border-accent/40 bg-accent-soft text-accent-ink';

const DANGER_CLASS = 'data-hovered:bg-danger-surface data-hovered:text-danger-text';

const ICON_BUTTON_TONE_CLASS = cva(ICON_BUTTON_CLASS, {
  variants: {
    tone: {
      neutral: ICON_BUTTON_HOVER_CLASS,
      danger: DANGER_CLASS,
      pressed: PRESSED_CLASS,
    },
  },
});

type IconButtonProps = Omit<PressableProps, 'children' | 'accessibleName'> & {
  icon: ReactNode;
  // The name a screen reader says and the tooltip shows, as no word is visible.
  label: string;
  // A shorter tooltip where the name carries context that sight takes from the layout, such as a
  // repeat block's position.
  tooltip?: string;
  pressed?: boolean;
  tone?: 'neutral' | 'danger';
};

export function IconButton({
  icon,
  label,
  tooltip = label,
  pressed = false,
  tone = 'neutral',
  ...pressable
}: IconButtonProps): ReactNode {
  const iconButtonTone = pressed ? 'pressed' : tone;

  return (
    <CellTooltip name={tooltip} className="shrink-0">
      <Pressable
        className={ICON_BUTTON_TONE_CLASS({ tone: iconButtonTone })}
        accessibleName={label}
        {...pressable}
      >
        {icon}
      </Pressable>
    </CellTooltip>
  );
}

// An icon that states a fact and does nothing, such as the token status. It is an image with a
// name, so a screen reader says the fact, and a tooltip shows it to sight. `hidden` keeps it from
// assistive tech where the fact is already said beside it.
export function IconStatus({
  icon,
  label,
  hidden = false,
}: {
  icon: ReactNode;
  label: string;
  hidden?: boolean;
}): ReactNode {
  return (
    <CellTooltip name={label} className="shrink-0">
      <span
        role={hidden ? undefined : 'img'}
        aria-label={hidden ? undefined : label}
        aria-hidden={hidden || undefined}
        className="inline-flex size-[32px] items-center justify-center text-text-muted"
      >
        {icon}
      </span>
    </CellTooltip>
  );
}
