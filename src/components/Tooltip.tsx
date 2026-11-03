import {
  FloatingPortal,
  type MiddlewareData,
  autoUpdate,
  flip,
  hide,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { type ReactNode, useEffect, useState } from 'react';

/**
 * Closes a popup once its anchor has scrolled out of view (floating-ui's `hide` middleware must be in the
 * chain), rather than leaving it pinned to the edge of the scrolling list — say, after the analysis panel
 * scrolled itself into view while its button kept focus. Returns whether to hide it until then.
 * `isPositioned` guards against the previous opening's data, still there on the first render of the next.
 */
export function useCloseWhenAnchorHidden(middlewareData: MiddlewareData, isPositioned: boolean, setOpen: (open: boolean) => void) {
  const hidden = isPositioned && !!middlewareData.hide?.referenceHidden;
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden, setOpen]);
  return hidden;
}

/**
 * A short label that pops up while the pointer is over its child (or keyboard focus is on it).
 * The child keeps its own aria-label; the tooltip is the visible counterpart. The wrapper span
 * takes the hover, so a disabled button still gets its tooltip.
 *
 * The message actions sit in a row under the text, so above them is the message itself. A one-line
 * label goes beside its button, within the row's height; a `tall` one (more than one line) below the
 * row. Above is only the last resort, when nothing else fits in the list.
 */
export function Tooltip({ label, tall = false, children }: { label: ReactNode; tall?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context, middlewareData, isPositioned } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: tall ? 'bottom' : 'left',
    middleware: [
      offset(6),
      // Only running out of room on the placement's own side flips it; shift() handles the other axis.
      flip({ crossAxis: false, fallbackPlacements: tall ? ['left', 'right', 'top'] : ['right', 'bottom', 'top'] }),
      shift({ padding: 8 }),
      hide(),
    ],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { mouseOnly: true, delay: { open: 250 } }),
    useFocus(context),
    useDismiss(context),
    useRole(context, { role: 'tooltip' }),
  ]);
  const hidden = useCloseWhenAnchorHidden(middlewareData, isPositioned, setOpen);

  return (
    <>
      <span className="tooltip-anchor" ref={refs.setReference} {...getReferenceProps()}>
        {children}
      </span>
      {open && (
        <FloatingPortal>
          <div
            className="tooltip"
            ref={refs.setFloating}
            style={{ ...floatingStyles, visibility: hidden ? 'hidden' : undefined }}
            {...getFloatingProps()}
          >
            {label}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
