import { afterEach, describe, expect, test } from 'bun:test';
import { revealElement } from '@/ui/reveal';

const nativeMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = nativeMatchMedia;
});

describe('revealElement', () => {
  test.each<[boolean, ScrollBehavior]>([
    [false, 'smooth'],
    [true, 'auto'],
  ])('with reduced motion %p scrolls by the nearest edge, %s', (reduced, behavior) => {
    // #given
    const element = document.createElement('div');
    const calls: unknown[] = [];
    element.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      calls.push(options);
    };

    // An own `matches` hides the getter of the list happy-dom makes.
    window.matchMedia = (query: string) =>
      Object.defineProperty(nativeMatchMedia.call(window, query), 'matches', {
        value: reduced && query === '(prefers-reduced-motion: reduce)',
      });
    // #when
    revealElement(element);
    // #then
    expect(calls).toEqual([{ block: 'nearest', inline: 'nearest', behavior }]);
  });
});
