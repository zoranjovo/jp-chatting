// Back closes the topmost open menu or dialog instead of leaving the app. Each one sits on a history entry
// of its own, marked with its token; Back pops it and closes that overlay, and closing it any other way
// takes the entry back off. This module is the one popstate listener: it answers its own history.back()s
// itself, gives a Back that closed an overlay to nothing else, and hands only the learner's own moves
// between entries to the chat router (onHistory).

import { useEffect, useRef } from 'react';

interface Overlay {
  token: number;
  close: () => void;
}

const open: Overlay[] = [];
let nextToken = 1;
/** Our own history.back()s still to land, which neither an overlay nor the router should answer. */
let ignore = 0;
/** An overlay that closed this tick; its entry comes off just after, unless an overlay opening in the same commit takes it over. */
let pendingBack: number | null = null;
let waiting: (() => void)[] = [];
let router: ((closedOverlay: boolean) => void) | null = null;

const entryToken = (): number | undefined => history.state?.overlay;

function settle() {
  if (ignore > 0 || pendingBack !== null) return;
  const run = waiting;
  waiting = [];
  for (const fn of run) fn();
}

if (typeof window !== 'undefined') {
  // Reloaded with a menu or dialog open: nothing is open now, so the entry is just the chat's.
  if (entryToken() !== undefined) history.replaceState(null, '');
  window.addEventListener('popstate', () => {
    if (ignore > 0) {
      ignore -= 1;
      return settle();
    }
    const top = open.pop();
    if (top) {
      top.close();
      return router?.(true);
    }
    // An entry an overlay left behind (say, Forward after Back closed a dialog): nothing is open there, so
    // step back off it -- Forward then does nothing, and Back goes on to the entry before it.
    if (entryToken() !== undefined) {
      return history.back();
    }
    router?.(false);
  });
}

/** Runs fn once the entries this module is taking off have gone, so it changes the entry the learner will be on. */
export function whenSettled(fn: () => void) {
  waiting.push(fn);
  settle();
}

/** The chat router: told about each Back or Forward, and whether all it did was close an overlay. */
export function onHistory(listener: (closedOverlay: boolean) => void): () => void {
  router = listener;
  return () => {
    if (router === listener) router = null;
  };
}

export function useBackToClose(active: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!active) return;
    let popped = false;
    const overlay: Overlay = {
      token: nextToken++,
      close: () => {
        popped = true;
        latest.current();
      },
    };
    open.push(overlay);
    // One overlay replacing another in the same commit (or StrictMode's remount) reuses its entry.
    if (pendingBack !== null && entryToken() === pendingBack) {
      pendingBack = null;
      history.replaceState({ overlay: overlay.token }, '');
    } else {
      history.pushState({ overlay: overlay.token }, '');
    }
    return () => {
      const i = open.indexOf(overlay);
      if (i >= 0) open.splice(i, 1);
      // Popped by Back, or the entry was taken over (say, by moving to another chat): nothing to take off.
      if (popped || entryToken() !== overlay.token) return;
      pendingBack = overlay.token;
      queueMicrotask(() => {
        if (pendingBack !== overlay.token) return;
        pendingBack = null;
        if (entryToken() === overlay.token) {
          ignore += 1;
          history.back();
        } else {
          settle();
        }
      });
    };
  }, [active]);
}
