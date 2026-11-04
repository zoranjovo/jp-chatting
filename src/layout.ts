// The narrow-screen layout, where the sidebar is a drawer behind the menu button.

import { useSyncExternalStore } from 'react';

/** The same query as the @media rule in styles.css; a unit test keeps the two in step. */
export const NARROW = '(max-width: 760px)';

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
