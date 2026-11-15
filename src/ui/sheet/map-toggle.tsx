import clsx from 'clsx';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { ToggleButton } from 'react-aria-components';

import type { LinkTarget } from '@/core/link-target';
import type { SelectionStep } from '@/core/token-selection';
import { copy } from '@/copy';
import { ICON_BUTTON_CLASS, IconStatus } from '@/ui/primitives/icon-button';
import { TokenIcon } from '@/ui/primitives/icons';
import { CellTooltip } from '@/ui/primitives/tooltip';

// CAP-32: what the sheets know of this client's map selection. `marked` holds the `linkTargetKey`
// of every target a selected token links to. `selector` is the GM's: the step one press of
// "Выделить на карте" takes for a target, `null` with no linked token on the open scene, and how
// to take it. A player and the preview get none.
export type MapSelectionView = {
  marked: ReadonlySet<string>;
  selector: {
    stepFor: (target: LinkTarget) => SelectionStep | null;
    take: (step: SelectionStep) => void;
  } | null;
};

export const MapSelectionContext = createContext<MapSelectionView>({
  marked: new Set(),
  selector: null,
});

// An icon toggle lights up under the pointer only while it is off, so the hover never hides the
// pressed look. Written out whole, so Tailwind finds the classes.
const ICON_TOGGLE_STATE_CLASS =
  '[&[data-hovered]:not([data-selected])]:bg-fill [&[data-hovered]:not([data-selected])]:text-text data-selected:border-accent/40 data-selected:bg-accent-soft data-selected:text-accent-ink';

type TokenControlProps = {
  target: LinkTarget;
  linked: boolean;
  // A repeat block names its toggle by its position, as several share the icon.
  toggleName?: string;
  // A repeat block says its token status in its own live region, so the icon hides it from
  // assistive tech and keeps it for sight.
  statusHidden?: boolean;
};

// CAP-18, CAP-32: the GM's token as one icon. While a linked token of the target is on the open
// scene, it is the toggle that selects them on the map; otherwise it shows the token status.
export function TokenControl({
  target,
  linked,
  toggleName = copy.command.selectOnMap,
  statusHidden = false,
}: TokenControlProps): ReactNode {
  const status = (
    <IconStatus
      icon={<TokenIcon linked={linked} />}
      label={linked ? copy.status.tokenLinked : copy.status.noToken}
      hidden={statusHidden}
    />
  );

  return linked ? <MapToggle target={target} name={toggleName} fallback={status} /> : status;
}

// Pressed while every linked token of the target on the open scene is selected. It shows only while
// one of them is on the open scene, so a press always reaches a token, and `fallback` otherwise.
function MapToggle({
  target,
  name,
  fallback,
}: {
  target: LinkTarget;
  name: string;
  fallback: ReactNode;
}): ReactNode {
  const { selector } = useContext(MapSelectionContext);
  const step = selector?.stepFor(target) ?? null;

  if (selector === null || step === null) {
    return fallback;
  }

  return (
    <CellTooltip name={name} className="shrink-0">
      <ToggleButton
        aria-label={name}
        isSelected={step.kind === 'deselect'}
        onChange={() => {
          selector.take(step);
        }}
        className={clsx(
          'inline-flex press items-center justify-center',
          ICON_BUTTON_CLASS,
          ICON_TOGGLE_STATE_CLASS,
        )}
      >
        <TokenIcon linked />
      </ToggleButton>
    </CellTooltip>
  );
}
