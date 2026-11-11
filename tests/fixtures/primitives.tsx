import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { platform } from '@/platform/current';
import '@/ui/main.css';
import { Banner } from '@/ui/primitives/banner';
import { Button } from '@/ui/primitives/button';
import { Chip } from '@/ui/primitives/chip';
import { Field } from '@/ui/primitives/field';
import { WindowShell } from '@/ui/shell/window-shell';
import { followTheme } from '@/ui/theme';

// main.css scans only src/, so a Tailwind class written here would not be generated.
const ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--spacing-2)',
  marginBottom: 'var(--spacing-4)',
};

// Never rendered. `tsc` fails here if a control can be disabled with no reason.
export const disabledWithoutReason = (
  <>
    {/* @ts-expect-error A Button is disabled only through its reason. */}
    <Button isDisabled>Button</Button>
    {/* @ts-expect-error A Chip is disabled only through its reason. */}
    <Chip isDisabled onPress={() => undefined}>
      Chip
    </Chip>
    {/* @ts-expect-error A Field is disabled only through its reason. */}
    <Field isDisabled accessibleName="Field" />
  </>
);

function Primitives(): ReactNode {
  const [presses, setPresses] = useState(0);
  const [typed, setTyped] = useState('');
  const [blurs, setBlurs] = useState(0);

  const press = (): void => {
    setPresses((count) => count + 1);
  };

  const content = (
    <>
      <Banner message={{ variant: 'danger', text: 'Danger banner' }} />
      <div style={ROW_STYLE}>
        <Button variant="primary" onPress={press}>
          Primary
        </Button>
        <Button onPress={press}>Default</Button>
        <Button variant="secondary" onPress={press}>
          Secondary
        </Button>
        <Chip onPress={press}>Pressable chip</Chip>
        <Chip>Status chip</Chip>
        <Field accessibleName="Enabled field" />
        <span data-testid="presses">{presses}</span>
        <Field
          accessibleName="Echo field"
          onChange={setTyped}
          onBlur={() => {
            setBlurs((count) => count + 1);
          }}
        />
        <span data-testid="field-echo">{`${typed}:${blurs}`}</span>
      </div>
      <div style={ROW_STYLE}>
        <Button onPress={press} disabledReason="Button reason">
          Disabled button
        </Button>
        <Chip onPress={press} disabledReason="Chip reason">
          Disabled chip
        </Chip>
        <Field accessibleName="Disabled field" disabledReason="Field reason" />
      </div>
    </>
  );

  return (
    <WindowShell
      layout={{
        kind: 'tabs',
        items: [],
        pinnedTabs: [{ id: 'fixture', label: 'Fixture', content }],
        selectedTab: 'fixture',
        onSelectTab: () => undefined,
      }}
      banner={{ variant: 'warning', text: 'Warning banner' }}
    />
  );
}

const container = document.getElementById('root');

if (container === null) {
  throw new Error('the fixture page has no #root element');
}

const root = createRoot(container);

platform.onReady(() => {
  void start();
});

async function start(): Promise<void> {
  try {
    await followTheme(platform.theme, document.documentElement);
    root.render(<Primitives />);
  } catch (error) {
    console.error('The primitives fixture could not render', error);
  }
}
