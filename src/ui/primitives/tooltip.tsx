import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, PointerEvent, FocusEvent, KeyboardEvent } from 'react';
import { Tooltip, TooltipTriggerStateContext } from 'react-aria-components';

type CellTooltipProps = {
  name: string;
  children: ReactNode;
};

const TOOLTIP_DELAY = 250;

// A cell name is an accessible name, not a description. The standalone RAC Tooltip keeps the
// visible hint out of aria-describedby, while this wrapper owns the hover, focus and touch paths.
export function CellTooltip({ name, children }: CellTooltipProps): ReactNode {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);
  const focusInside = useRef(false);
  const touchTapOpen = useRef(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const show = useCallback((immediate: boolean): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (immediate) {
      setIsOpen(true);

      return;
    }

    timer.current = setTimeout(() => {
      timer.current = null;
      setIsOpen(true);
    }, TOOLTIP_DELAY);
  }, []);

  const hide = useCallback((): void => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    touchTapOpen.current = false;
    setIsOpen(false);
  }, []);

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

    window.addEventListener('keydown', onWindowKeyDown, true);
    window.addEventListener('pointerdown', onWindowPointerDown, true);

    return () => {
      window.removeEventListener('keydown', onWindowKeyDown, true);
      window.removeEventListener('pointerdown', onWindowPointerDown, true);
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

    hideIfInactive();
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
      className="inline-flex min-w-0"
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
          onOpenChange={setIsOpen}
          triggerRef={triggerRef}
          placement="top"
          offset={8}
          className="max-w-[100vw] rounded-sm border border-line bg-surface-tab px-2 py-1 text-label-sm text-text [overflow-wrap:anywhere]"
        >
          {name}
        </Tooltip>
      </TooltipTriggerStateContext.Provider>
    </span>
  );
}
