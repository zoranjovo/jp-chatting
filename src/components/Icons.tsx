// Line icons for the message actions, drawn on a 24px grid and coloured with currentColor.

import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Lines of text under a magnifying glass: take a sentence apart. */
export const BreakdownIcon = () => (
  <Icon>
    <path d="M4 6h16M4 12h6M4 18h5" />
    <circle cx="16" cy="15" r="3.5" />
    <path d="m18.6 17.6 2.4 2.4" />
  </Icon>
);

/** A speech bubble with a tick: check what I wrote. */
export const CheckIcon = () => (
  <Icon>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

/** An arrow turning back: undo from here. */
export const RewindIcon = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);

export const InfoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </Icon>
);
