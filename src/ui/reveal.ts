const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// Scrolls an element the window was asked to show into view, by the shortest move. The move is
// smooth unless the viewer asked for reduced motion.
export function revealElement(element: Element | null | undefined): void {
  element?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth',
  });
}
