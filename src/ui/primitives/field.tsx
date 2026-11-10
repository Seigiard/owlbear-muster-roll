import type { ReactNode } from 'react';
import { Input, Text, TextField } from 'react-aria-components';
import type { TextFieldProps } from 'react-aria-components';

type FieldProps = Pick<TextFieldProps, 'value' | 'defaultValue' | 'onChange' | 'onBlur'> & {
  accessibleName: string;
  disabledReason?: string;
};

export function Field({ accessibleName, disabledReason, ...fieldProps }: FieldProps): ReactNode {
  return (
    <TextField
      className="flex flex-col gap-1"
      aria-label={accessibleName}
      isDisabled={disabledReason !== undefined}
      {...fieldProps}
    >
      <Input className="touch-target w-full border-b border-dotted border-line-strong bg-transparent px-1 text-text data-disabled:opacity-50" />
      {disabledReason === undefined ? null : (
        <Text slot="description" className="text-label-sm text-text-muted">
          {disabledReason}
        </Text>
      )}
    </TextField>
  );
}
