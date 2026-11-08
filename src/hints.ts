// One-time hints, remembered in this browser. Where storage is blocked a hint just comes back next time.

import { useSyncExternalStore } from 'react';

const BREAKDOWN_SEEN = 'jp-chatting:breakdown-hint-seen';

const listeners = new Set<() => void>();
let seen = read();

function read(): boolean {
  try {
    return localStorage.getItem(BREAKDOWN_SEEN) === '1';
  } catch {
    return false;
  }
}

/** Once the learner has used Breakdown, or closed the hint, it never shows again. */
export function breakdownHintDone() {
  if (seen) return;
  seen = true;
  try {
    localStorage.setItem(BREAKDOWN_SEEN, '1');
  } catch {}
  for (const fn of listeners) fn();
}

/** Whether the hint pointing at Breakdown on the partner's first message should show. */
export function useBreakdownHint(): boolean {
  return !useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => seen,
    () => true,
  );
}
