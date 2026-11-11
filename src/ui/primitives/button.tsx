import { useId } from 'react';
import type { ReactNode, Ref } from 'react';
import { Button as AriaButton } from 'react-aria-components';

const VARIANT_CLASS = {
  primary: 'bg-accent text-accent-contrast',
  secondary: 'border border-line text-text',
} as const;

export type PressableProps = {
  children: ReactNode;
  onPress?: () => void;
  // A control is disabled only through its reason, so no disabled control can lack one.
  disabledReason?: string;
  // Or through the id of text already on the page that says why, which names the reason instead.
  disabledReasonId?: string;
  autoFocus?: boolean;
  // Replaces the visible text as the name, for a control that repeats and must say which one it is.
  accessibleName?: string;
  // The id of a message about this control, for an enabled one. A disabled one names its reason.
  describedBy?: string;
  // For a control that shows or hides a panel: whether it is shown, and the panel's id.
  expanded?: boolean;
  controls?: string;
  ref?: Ref<HTMLButtonElement>;
};

type ButtonProps = PressableProps & { variant?: keyof typeof VARIANT_CLASS };

export function Button({ variant = 'secondary', ...pressable }: ButtonProps): ReactNode {
  return <Pressable className={`rounded-sm px-3 ${VARIANT_CLASS[variant]}`} {...pressable} />;
}

export function Pressable({
  className,
  children,
  onPress,
  disabledReason,
  disabledReasonId,
  autoFocus,
  accessibleName,
  describedBy,
  expanded,
  controls,
  ref,
}: PressableProps & { className: string }): ReactNode {
  const reasonId = useId();
  const isDisabled = disabledReason !== undefined || disabledReasonId !== undefined;

  const button = (
    <AriaButton
      ref={ref}
      aria-label={accessibleName}
      className={`touch-target inline-flex items-center justify-center data-disabled:opacity-50 ${className}`}
      isDisabled={isDisabled}
      onPress={onPress}
      autoFocus={autoFocus}
      aria-describedby={isDisabled ? (disabledReasonId ?? reasonId) : describedBy}
      aria-expanded={expanded}
      aria-controls={controls}
    >
      {children}
    </AriaButton>
  );

  if (disabledReason === undefined) {
    return button;
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {button}
      <span id={reasonId} className="text-label-sm text-text-muted">
        {disabledReason}
      </span>
    </span>
  );
}
