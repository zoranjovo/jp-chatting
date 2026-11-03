// Back closes the topmost open menu or dialog instead of leaving the app. Each one pushes a history
// entry while open; Back pops it and closes that overlay, and closing it any other way takes the entry
// back off. Moving to another chat from an open menu takes the entry over instead (see showInUrl in App).

import { useEffect, useRef } from 'react';

const open: (() => void)[] = [];
/** Pops we caused ourselves with history.back(), which no overlay should answer. */
let ignore = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignore > 0) ignore -= 1;
    else open.pop()?.();
  });
}

export function useBackToClose(active: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!active) return;
    let popped = false;
    const handler = () => {
      popped = true;
      latest.current();
    };
    open.push(handler);
    history.pushState({ overlay: true }, '');
    return () => {
      const i = open.indexOf(handler);
      if (i >= 0) open.splice(i, 1);
      if (!popped && history.state?.overlay) {
        ignore += 1;
        history.back();
      }
    };
  }, [active]);
}
