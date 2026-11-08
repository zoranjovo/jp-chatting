// Which messages have their Breakdown or Check panel open, kept for this browser tab (sessionStorage), so a
// panel is still open after switching chats or reloading. Message ids are unique across chats.

const KEY = 'jp-chatting:open-analyses';

function read(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function isAnalysisOpen(messageId: string): boolean {
  return read().has(messageId);
}

export function setAnalysisOpen(messageId: string, open: boolean) {
  const ids = read();
  if (open === ids.has(messageId)) return;
  if (open) ids.add(messageId);
  else ids.delete(messageId);
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {}
}
