import type { ReactNode } from 'react';

/**
 * Content that slides open and folds away (see .reveal in styles.css). It
 * stays mounted so closing can animate; once closed it is inert and hidden
 * from screen readers. Mounted already open, it just appears -- the
 * transition only plays on a change.
 */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`reveal ${open ? 'open' : ''}`} inert={!open}>
      <div className="reveal-clip">{children}</div>
    </div>
  );
}
