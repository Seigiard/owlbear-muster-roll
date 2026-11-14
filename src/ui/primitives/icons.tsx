import type { ReactNode } from 'react';

// 16 px outline icons drawn in `currentColor`, so a control's state recolors them. The stroke
// matches 13 px text at 400 to 500 weight. Each one is decoration: the control carries the name.
const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

// A token on the map. A linked one has a dot at its heart; one with no token is struck through, so
// the two differ by shape and not by color alone.
export function TokenIcon({ linked }: { linked: boolean }): ReactNode {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 2 14 8l-6 6-6-6 6-6Z" />
      {linked ? (
        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      ) : (
        <path d="m3 13 10-10" />
      )}
    </svg>
  );
}

// Players who may edit a sheet.
export function AccessIcon(): ReactNode {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M2 13c.6-2 2.1-3 4-3s3.4 1 4 3" />
      <path d="M10.5 3.6a2.25 2.25 0 0 1 0 3.8" />
      <path d="M12 10.3c1 .4 1.7 1.3 2 2.7" />
    </svg>
  );
}

export function TrashIcon(): ReactNode {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 4.5h10" />
      <path d="M6 4.5V3h4v1.5" />
      <path d="m4.5 4.5.6 8.5h5.8l.6-8.5" />
    </svg>
  );
}
