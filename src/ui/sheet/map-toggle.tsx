import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { ToggleButton } from 'react-aria-components';

import type { LinkTarget } from '@/core/link-target';
import type { SelectionStep } from '@/core/token-selection';
import { copy } from '@/ui/copy';
import { SECONDARY_BUTTON_CLASS } from '@/ui/primitives/button';

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

type MapToggleProps = {
  target: LinkTarget;
  // Names a repeat block's toggle, as several share the visible label.
  accessibleName?: string;
};

// Pressed while every linked token of the target on the open scene is selected. It shows only while
// one of them is on the open scene, so a press always reaches a token.
export function MapToggle({ target, accessibleName }: MapToggleProps): ReactNode {
  const { selector } = useContext(MapSelectionContext);
  const step = selector?.stepFor(target) ?? null;

  if (selector === null || step === null) {
    return null;
  }

  return (
    <ToggleButton
      aria-label={accessibleName}
      isSelected={step.kind === 'deselect'}
      onChange={() => {
        selector.take(step);
      }}
      className={`${SECONDARY_BUTTON_CLASS} shrink-0 data-selected:border-accent data-selected:text-accent`}
    >
      {copy.command.selectOnMap}
    </ToggleButton>
  );
}
