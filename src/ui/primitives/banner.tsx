import type { ReactNode } from 'react';

const VARIANT_CLASS = {
  warning: 'bg-warning-surface text-warning-text',
  danger: 'bg-danger-surface text-danger-text',
} as const;

export type BannerMessage = { variant: keyof typeof VARIANT_CLASS; text: string };

// The live region stays mounted while empty: text injected together with its region is often
// not announced.
export function Banner({ message }: { message: BannerMessage | undefined }): ReactNode {
  return (
    <div
      role="status"
      className={message === undefined ? undefined : `px-3 py-2 ${VARIANT_CLASS[message.variant]}`}
    >
      {message?.text}
    </div>
  );
}
