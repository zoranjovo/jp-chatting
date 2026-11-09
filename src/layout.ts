// The narrow-screen layout, where the sidebar is a drawer behind the menu button. Short screens get it too:
// a phone on its side is wide, but with the keyboard up a docked sidebar leaves no room for the chat. Not a
// tablet on its side, though: the keyboard resizes the page, and its layout would flip each time it opened.

import { useSyncExternalStore } from 'react';

/** The same query as the @media rule in styles.css; a unit test keeps the two in step. */
export const NARROW = '(max-width: 760px), (max-width: 1024px) and (max-height: 500px)';

/** A touch screen as the main pointer: a phone or tablet, whose keyboard has no Shift+Enter. */
export const TOUCH = '(pointer: coarse)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
