import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, PointerEvent, FocusEvent, KeyboardEvent } from 'react';
import { Tooltip, TooltipTriggerStateContext } from 'react-aria-components';

type CellTooltipProps = {
  name: string;
  children: ReactNode;
  className?: string;
};

const TOOLTIP_DELAY = 250;

let activeTooltip: { id: symbol; hide: () => void } | null = null;
let scheduledTooltip: symbol | null = null;
let scrollTooltip: symbol | null = null;
let scrollLockUntil = 0;

// A cell name is an accessible name, not a description. The standalone RAC Tooltip keeps the
// visible hint out of aria-describedby, while this wrapper owns the hover, focus and touch paths.
export function CellTooltip({ name, children, className }: CellTooltipProps): ReactNode {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);
  const focusInside = useRef(false);
  const touchTapOpen = useRef(false);
  const tooltipId = useRef(Symbol());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const hide = useCallback((): void => {
    if (activeTooltip?.id === tooltipId.current) {
      activeTooltip = null;
    }

    if (scheduledTooltip === tooltipId.current) {
      scheduledTooltip = null;
    }

    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    touchTapOpen.current = false;
    setIsOpen(false);
  }, []);

  const show = useCallback(
    (immediate: boolean): void => {
      if (Date.now() >= scrollLockUntil) {
        scrollTooltip = null;
      }

      if (scrollTooltip !== null && scrollTooltip !== tooltipId.current) {
        return;
      }

      if (activeTooltip !== null && activeTooltip.id !== tooltipId.current) {
        return;
      }

      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }

      const open = (): void => {
        scheduledTooltip = null;
        activeTooltip = { id: tooltipId.current, hide };
        setIsOpen(true);
      };

      if (immediate) {
        open();

        return;
      }

      scheduledTooltip = tooltipId.current;
      timer.current = setTimeout(() => {
        timer.current = null;
        open();
      }, TOOLTIP_DELAY);
    },
    [hide],
  );

  const hideIfInactive = useCallback((): void => {
    if (!pointerInside.current && !focusInside.current) {
      hide();
    }
  }, [hide]);

  useEffect(() => {
    function onWindowKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        hide();
      }
    }

    function onWindowPointerDown(event: globalThis.PointerEvent): void {
      const target = event.target;

      if (!(target instanceof Node) || !triggerRef.current?.contains(target)) {
        hide();
      }
    }

    function onWindowPointerMove(event: globalThis.PointerEvent): void {
      const target = event.target;

      if (
        (activeTooltip?.id === tooltipId.current || scheduledTooltip === tooltipId.current) &&
        !focusInside.current &&
        (!(target instanceof Node) || !triggerRef.current?.contains(target))
      ) {
        hide();
      }
    }

    function onWindowScroll(): void {
      scrollTooltip = activeTooltip?.id ?? scheduledTooltip;
      scrollLockUntil = Date.now() + 1000;
    }

    window.addEventListener('keydown', onWindowKeyDown, true);
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('pointermove', onWindowPointerMove, true);
    window.addEventListener('scroll', onWindowScroll, true);

    return () => {
      window.removeEventListener('keydown', onWindowKeyDown, true);
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
      window.removeEventListener('pointermove', onWindowPointerMove, true);
      window.removeEventListener('scroll', onWindowScroll, true);
      hide();
    };
  }, [hide]);

  function onFocus(event: FocusEvent<HTMLSpanElement>): void {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    focusInside.current = true;
    show(true);
  }

  function onBlur(event: FocusEvent<HTMLSpanElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      focusInside.current = false;
      hideIfInactive();
    }
  }

  function onPointerEnter(event: PointerEvent<HTMLSpanElement>): void {
    pointerInside.current = true;

    if (event.pointerType !== 'touch') {
      touchTapOpen.current = false;
    }

    show(false);
  }

  function onPointerLeave(_event: PointerEvent<HTMLSpanElement>): void {
    pointerInside.current = false;

    if (touchTapOpen.current) {
      return;
    }

    if (scrollTooltip === tooltipId.current && Date.now() < scrollLockUntil) {
      return;
    }

    if (_event.pointerType === 'touch') {
      hideIfInactive();
    }
  }

  function onPointerDown(event: PointerEvent<HTMLSpanElement>): void {
    touchTapOpen.current = event.pointerType === 'touch';

    if (event.pointerType === 'touch') {
      show(true);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>): void {
    if (event.key === 'Escape') {
      hide();
    }
  }

  return (
    <span
      ref={triggerRef}
      className={`inline-flex min-w-0 ${className ?? ''}`}
      onFocusCapture={onFocus}
      onBlurCapture={onBlur}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDownCapture={onPointerDown}
      onKeyDownCapture={onKeyDown}
    >
      {children}
      <TooltipTriggerStateContext.Provider
        value={{
          isOpen,
          shouldSkipAnimation: true,
          open: () => setIsOpen(true),
          close: () => setIsOpen(false),
        }}
      >
        <Tooltip
          isOpen={isOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsOpen(true);
            } else if (scrollTooltip !== tooltipId.current || Date.now() >= scrollLockUntil) {
              hide();
            }
          }}
          triggerRef={triggerRef}
          placement="top"
          offset={8}
          className="max-w-[100vw] rounded-md border border-transparent bg-surface-raised px-2 py-1 text-label-sm text-text shadow-popover [overflow-wrap:anywhere]"
        >
          {name}
        </Tooltip>
      </TooltipTriggerStateContext.Provider>
    </span>
  );
}
