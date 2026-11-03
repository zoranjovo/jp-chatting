import {
  FloatingPortal,
  autoUpdate,
  flip,
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

/**
 * A short label that pops up while the pointer is over its child (or keyboard focus is on it).
 * The child keeps its own aria-label; the tooltip is the visible counterpart. The wrapper span
 * takes the hover, so a disabled button still gets its tooltip.
 */
export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    middleware: [offset(6), flip(), shift({ padding: 8 })],
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
          <div className="tooltip" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
            {label}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
