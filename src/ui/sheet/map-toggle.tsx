import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { ToggleButton } from 'react-aria-components';

import type { LinkTarget } from '@/core/link-target';
import type { SelectionStep } from '@/core/token-selection';
import { copy } from '@/ui/copy';
import { SECONDARY_BUTTON_CLASS } from '@/ui/primitives/button';
import { ICON_BUTTON_CLASS } from '@/ui/primitives/icon-button';
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

type MapToggleProps = {
  target: LinkTarget;
  // Names a repeat block's toggle, as several share the visible label.
  accessibleName?: string;
  // The sheet header draws the toggle as the token icon, and shows `fallback`, the token status,
  // while no linked token is on the open scene.
  appearance?: 'text' | 'icon';
  fallback?: ReactNode;
};

// Pressed while every linked token of the target on the open scene is selected. It shows only while
// one of them is on the open scene, so a press always reaches a token.
export function MapToggle({
  target,
  accessibleName,
  appearance = 'text',
  fallback = null,
}: MapToggleProps): ReactNode {
  const { selector } = useContext(MapSelectionContext);
  const step = selector?.stepFor(target) ?? null;

  if (selector === null || step === null) {
    return fallback;
  }

  if (appearance === 'icon') {
    const name = accessibleName ?? copy.command.selectOnMap;

    return (
      <CellTooltip name={name} className="shrink-0">
        <ToggleButton
          aria-label={name}
          isSelected={step.kind === 'deselect'}
          onChange={() => {
            selector.take(step);
          }}
          className={`press inline-flex items-center justify-center ${ICON_BUTTON_CLASS} ${ICON_TOGGLE_STATE_CLASS}`}
        >
          <TokenIcon linked />
        </ToggleButton>
      </CellTooltip>
    );
  }

  return (
    <ToggleButton
      aria-label={accessibleName}
      isSelected={step.kind === 'deselect'}
      onChange={() => {
        selector.take(step);
      }}
      className={`${SECONDARY_BUTTON_CLASS} shrink-0 data-selected:border-accent/40 data-selected:bg-accent-soft data-selected:text-accent-ink`}
    >
      {copy.command.selectOnMap}
    </ToggleButton>
  );
}
