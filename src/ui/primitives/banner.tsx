import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

const BANNER_CLASS = cva('px-3 py-2', {
  variants: {
    variant: {
      warning: 'bg-warning-surface text-warning-text',
      danger: 'bg-danger-surface text-danger-text',
    },
  },
});

export type BannerMessage = {
  variant: NonNullable<VariantProps<typeof BANNER_CLASS>['variant']>;
  text: string;
};

// The live region stays mounted while empty: text injected together with its region is often
// not announced.
export function Banner({ message }: { message: BannerMessage | undefined }): ReactNode {
  return (
    <div role="status" className={bannerClass(message)}>
      {message?.text}
    </div>
  );
}

function bannerClass(message: BannerMessage | undefined): string | undefined {
  if (message === undefined) {
    return undefined;
  }

  return BANNER_CLASS({ variant: message.variant });
}
