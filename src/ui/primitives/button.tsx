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
  autoFocus?: boolean;
  // Replaces the visible text as the name, for a control that repeats and must say which one it is.
  accessibleName?: string;
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
  autoFocus,
  accessibleName,
  ref,
}: PressableProps & { className: string }): ReactNode {
  const reasonId = useId();
  const isDisabled = disabledReason !== undefined;

  const button = (
    <AriaButton
      ref={ref}
      aria-label={accessibleName}
      className={`touch-target inline-flex items-center justify-center data-disabled:opacity-50 ${className}`}
      isDisabled={isDisabled}
      onPress={onPress}
      autoFocus={autoFocus}
      aria-describedby={isDisabled ? reasonId : undefined}
    >
      {children}
    </AriaButton>
  );

  if (!isDisabled) {
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
