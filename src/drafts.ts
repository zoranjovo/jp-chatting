// Unsent text per chat. Kept outside the composer so a draft stays with its own
// chat, and so actions that start elsewhere -- a rewind that finishes after the
// learner switched chats, a failed send, deleting a chat -- reach the right one.
// The learner's own edits are saved to the server once typing pauses (the saver
// is set by the app); text the server decided replaces what's here unsaved.

import { useCallback, useSyncExternalStore } from 'react';

/** How long typing must pause before the draft is saved. */
export const DRAFT_SAVE_MS = 1000;

const drafts = new Map<string, string>();
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Chats whose saved draft has been taken in once; a later copy of the chat mustn't overwrite newer typing. */
const known = new Set<string>();
let save: (chatId: string, text: string) => void = () => {};

export function setDraftSaver(saver: (chatId: string, text: string) => void): void {
  save = saver;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function put(chatId: string, text: string) {
  if (text) drafts.set(chatId, text);
  else drafts.delete(chatId);
  for (const listener of listeners) listener();
}

function cancelSave(chatId: string) {
  clearTimeout(timers.get(chatId));
  timers.delete(chatId);
}

export function getDraft(chatId: string): string {
  return drafts.get(chatId) ?? '';
}

/** The learner's own change: shown at once, saved once typing pauses. */
export function setDraft(chatId: string, text: string): void {
  put(chatId, text);
  cancelSave(chatId);
  timers.set(
    chatId,
    setTimeout(() => {
      timers.delete(chatId);
      save(chatId, getDraft(chatId));
    }, DRAFT_SAVE_MS),
  );
}

/** Puts text back above anything already typed, with a blank line between. */
export function prependDraft(chatId: string, text: string): void {
  const current = getDraft(chatId);
  setDraft(chatId, current.trim() ? `${text}\n\n${current}` : text);
}

/** The draft saved with a chat, taken in the first time the chat arrives. */
export function seedDraft(chatId: string, text: string): void {
  if (known.has(chatId)) return;
  known.add(chatId);
  if (text && !drafts.has(chatId)) put(chatId, text);
}

/** Text the server has just decided (a rewind, an undo) or that no longer has a chat: nothing is left to save. */
export function replaceDraft(chatId: string, text: string): void {
  cancelSave(chatId);
  known.add(chatId);
  put(chatId, text);
}

/** The text as it stands, its pending save dropped: for a request that takes it to the server itself. */
export function takeDraft(chatId: string): string {
  cancelSave(chatId);
  return getDraft(chatId);
}

export function useDraft(chatId: string): [string, (text: string) => void] {
  const snapshot = () => getDraft(chatId);
  const text = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [text, useCallback((next: string) => setDraft(chatId, next), [chatId])];
}
