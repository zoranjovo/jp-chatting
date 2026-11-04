// Unsent text per chat. Kept outside the composer so a draft stays with its own
// chat, and so actions that start elsewhere -- a rewind that finishes after the
// learner switched chats, a failed send, deleting a chat -- reach the right one.

import { useCallback, useSyncExternalStore } from 'react';

const drafts = new Map<string, string>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function getDraft(chatId: string): string {
  return drafts.get(chatId) ?? '';
}

export function setDraft(chatId: string, text: string): void {
  if (text) drafts.set(chatId, text);
  else drafts.delete(chatId);
  for (const listener of listeners) listener();
}

/** Puts text back above anything already typed, with a blank line between. */
export function prependDraft(chatId: string, text: string): void {
  const current = getDraft(chatId);
  setDraft(chatId, current.trim() ? `${text}\n\n${current}` : text);
}

export function useDraft(chatId: string): [string, (text: string) => void] {
  const snapshot = () => getDraft(chatId);
  const text = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [text, useCallback((next: string) => setDraft(chatId, next), [chatId])];
}
