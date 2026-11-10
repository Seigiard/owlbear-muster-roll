import type { ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { Button, Tab, TabList, ToggleButton } from 'react-aria-components';

const BAR_CLASS = 'flex justify-end gap-2 bg-surface-bar px-2 pt-2';

const SCROLLER_CLASS =
  'flex min-w-[0] flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

const TAB_CLASS =
  'touch-target inline-flex shrink-0 items-center rounded-t-md bg-surface-tab px-3 text-text -outline-offset-2';

const SELECTABLE_CLASS = 'data-selected:bg-surface data-selected:text-accent';

// A long name is cut with an ellipsis. The tab text stays whole, so it is still the accessible name.
const SCROLLING_TAB_CLASS = `${TAB_CLASS} ${SELECTABLE_CLASS} max-w-[160px]`;

// Pinned tabs sit after "+" and stick to the right edge. The pseudo-element fills the gap before
// each one with the bar color, so a tab scrolled under them never shows through the gap.
const PINNED_TAB_CLASS = `${TAB_CLASS} ${SELECTABLE_CLASS} sticky order-2 before:absolute before:inset-y-0 before:-left-2 before:w-2 before:bg-surface-bar`;

// The window's line height, for a wheel that reports lines instead of pixels.
const WHEEL_LINE_PX = 20;

export type ShellTab = { id: string; label: string; accessibleName?: string; content: ReactNode };

export type ShellToggle = {
  label: string;
  accessibleName: string;
  isPressed: boolean;
  onToggle: (isPressed: boolean) => void;
};

export type ShellAction = { label: string; accessibleName: string; onPress: () => void };

type TabBarProps = {
  scrollingTabs: readonly ShellTab[];
  pinnedTabs: readonly ShellTab[];
  add?: ShellAction;
};

// One tab list holds every tab, so the arrow keys cross from the characters to NPC and the gear.
// It renders as `display: contents`, so its tabs and "+" share one scrolling row while "+" stays
// outside the list.
export function TabBar({ scrollingTabs, pinnedTabs, add }: TabBarProps): ReactNode {
  return (
    <div className="bg-surface-bar px-2 pt-2">
      <div data-tab-scroller className={SCROLLER_CLASS} onWheel={scrollSideways}>
        <TabList className="contents">
          {scrollingTabs.map((tab) => (
            <Tab
              key={tab.id}
              id={tab.id}
              aria-label={tab.accessibleName}
              ref={revealIfSelected}
              className={SCROLLING_TAB_CLASS}
            >
              <span className="truncate">{tab.label}</span>
            </Tab>
          ))}
          {pinnedTabs.map((tab, index) => (
            <Tab
              key={tab.id}
              id={tab.id}
              aria-label={tab.accessibleName}
              ref={watchPinned}
              data-pinned
              className={index === 0 ? `${PINNED_TAB_CLASS} ml-auto` : PINNED_TAB_CLASS}
            >
              {tab.label}
            </Tab>
          ))}
        </TabList>
        {add === undefined ? null : (
          <Button
            aria-label={add.accessibleName}
            onPress={add.onPress}
            className={`${TAB_CLASS} order-1`}
          >
            {add.label}
          </Button>
        )}
      </div>
    </div>
  );
}

// React Aria marks each tab with its key, and the app gives a tab no id of its own in the DOM.
export function focusTab(id: string): void {
  document.querySelector<HTMLElement>(`[role="tab"][data-key="${CSS.escape(id)}"]`)?.focus();
}

// A tab bar with one tab could never switch away, so a lone gear is a toggle button instead.
export function ToggleBar({ toggle }: { toggle: ShellToggle }): ReactNode {
  return (
    <div className={BAR_CLASS}>
      <ToggleButton
        aria-label={toggle.accessibleName}
        isSelected={toggle.isPressed}
        onChange={toggle.onToggle}
        className={`${TAB_CLASS} ${SELECTABLE_CLASS}`}
      >
        {toggle.label}
      </ToggleButton>
    </div>
  );
}

// A mouse wheel has only a vertical delta. A trackpad or a tilt wheel that has a horizontal one
// already scrolls the row by itself.
function scrollSideways(event: ReactWheelEvent<HTMLDivElement>): void {
  if (event.deltaX !== 0 || event.deltaY === 0) {
    return;
  }

  const scroller = event.currentTarget;

  const unit =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? WHEEL_LINE_PX
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scroller.clientWidth
        : 1;

  scroller.scrollLeft += event.deltaY * unit;
}

let pinObserver: ResizeObserver | null = null;

// React Aria renders the tabs once more in a hidden pass and gives the real tabs the refs from that
// pass, so the ref must not reach any state of this component. Each tab finds its own scroller.
// The observer also fires once for every element it starts to watch.
function watchPinned(element: HTMLElement | null): (() => void) | undefined {
  if (element === null) {
    return undefined;
  }

  pinObserver ??= new ResizeObserver((entries) => {
    const scrollers = new Set(
      entries.map((entry) => entry.target.closest<HTMLElement>('[data-tab-scroller]')),
    );

    for (const scroller of scrollers) {
      if (scroller !== null) {
        pinToRightEdge(scroller);
      }
    }
  });

  const observer = pinObserver;

  observer.observe(element);

  return () => {
    observer.unobserve(element);
  };
}

// A tab that mounts already selected is the one "+" has just created, so it scrolls into view.
// React Aria adds a tab in a later commit than the one that selects it, so an effect would miss it.
function revealIfSelected(element: HTMLElement | null): void {
  if (element?.getAttribute('aria-selected') === 'true') {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function pinnedElements(scroller: HTMLElement): HTMLElement[] {
  return [...scroller.querySelectorAll<HTMLElement>('[data-pinned]')];
}

// Each pinned tab sticks at the summed width of the pinned tabs after it, so they never overlap.
function pinToRightEdge(scroller: HTMLElement): void {
  const gap = Number.parseFloat(getComputedStyle(scroller).columnGap) || 0;
  const pinned = pinnedElements(scroller);
  let right = 0;

  for (let index = pinned.length - 1; index >= 0; index -= 1) {
    const element = pinned[index];

    if (element !== undefined) {
      element.style.right = `${right}px`;
      right += element.getBoundingClientRect().width + gap;
    }
  }

  // A tab scrolled into view, by focus or on creation, then stops clear of the pinned tabs.
  scroller.style.scrollPaddingInlineEnd = `${right}px`;
}
