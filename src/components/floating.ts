// Helpers for popups anchored in the scrolling message list (the action tooltips and the ⓘ popup).

import type { MiddlewareData, MiddlewareState } from '@floating-ui/react';
import type { CSSProperties } from 'react';

/**
 * Where a popup anchored in the message list must stay: the list itself, not just the viewport (the popups
 * are portalled to the body, so floating-ui would otherwise let them spill over the top bar or the composer).
 */
export function listBoundary(state: MiddlewareState): { boundary: Element } | Record<string, never> {
  const list = (state.elements.reference as Element).closest?.('.messages');
  return list ? { boundary: list } : {};
}

/**
 * A popup's style, hidden while its anchor is scrolled out of view (the `hide` middleware must be in the chain)
 * rather than pinned to the list's edge. It stays open, so it shows again when the anchor scrolls back: a
 * click-opened popup isn't lost, and a focused button gets its label back. `isPositioned` guards against the
 * previous opening's data, still there on the first render of the next.
 */
export function anchoredStyle(floatingStyles: CSSProperties, middlewareData: MiddlewareData, isPositioned: boolean): CSSProperties {
  return isPositioned && middlewareData.hide?.referenceHidden ? { ...floatingStyles, visibility: 'hidden' } : floatingStyles;
}
