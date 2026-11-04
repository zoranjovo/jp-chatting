import {
  FloatingPortal,
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
import { type ReactNode, useState } from 'react';
import { anchoredStyle, listBoundary } from './floating.ts';

/**
 * A short label that pops up while the pointer is over its child (or keyboard focus is on it).
 * The child keeps its own aria-label; the tooltip is the visible counterpart. The wrapper span
 * takes the hover, so a disabled button still gets its tooltip.
 *
 * The message actions sit in a row under the text, with more buttons beside them, so every label
 * goes below its button, whatever its height -- covering neither the message nor the other actions.
 * Above is the fallback when there is no room below in the message list.
 */
export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context, middlewareData, isPositioned } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom',
    middleware: [
      offset(6),
      flip((state) => ({ crossAxis: false, fallbackPlacements: ['top'], ...listBoundary(state) })),
      shift((state) => ({ padding: 8, ...listBoundary(state) })),
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

  return (
    <>
      <span className="tooltip-anchor" ref={refs.setReference} {...getReferenceProps()}>
        {children}
      </span>
      {open && (
        <FloatingPortal>
          <div className="tooltip" ref={refs.setFloating} style={anchoredStyle(floatingStyles, middlewareData, isPositioned)} {...getFloatingProps()}>
            {label}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
