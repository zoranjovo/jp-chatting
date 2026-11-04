// One status region per chat (in ChatView) that every part of it speaks through, so screen readers
// hear each thing once and nothing lingers as a hidden copy of what is on screen.

import { createContext, useContext, type ReactNode } from 'react';

export const AnnounceContext = createContext<(text: ReactNode) => void>(() => {});

export function useAnnounce(): (text: ReactNode) => void {
  return useContext(AnnounceContext);
}
