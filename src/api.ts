import type { Chat, ChatSummary, Message, ModelList, ModelTest, Politeness, ProviderKind, ReplyStatus, Settings } from '../shared/types.ts';

/** A failed API call, with the server's status: 502 is the AI model failing (an AiError on the server). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** What went wrong, for the learner: the kind leads in plain words, the detail is the technical message. */
export interface UiError {
  kind: 'model' | 'server' | 'other';
  detail: string;
}

export function errorOf(err: unknown): UiError {
  const detail = err instanceof Error ? err.message : String(err);
  if (err instanceof ApiError) return { kind: err.status === 502 ? 'model' : 'other', detail };
  // fetch() itself failed: the app's own server isn't answering (stopped, or the phone left the network).
  if (err instanceof TypeError) return { kind: 'server', detail };
  return { kind: 'other', detail };
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `${res.status} ${res.statusText}`, res.status);
  return data as T;
}

export const api = {
  settings: () => request<Settings>('GET', '/api/settings'),
  saveSettings: (patch: Partial<Settings>) => request<Settings>('PUT', '/api/settings', patch),
  models: (provider: ProviderKind, endpoint?: Settings['endpoint']) => request<ModelList>('POST', '/api/models', { provider, endpoint }),
  testModel: (draft: Pick<Settings, 'provider' | 'endpoint' | 'claude'>) => request<ModelTest>('POST', '/api/test-model', draft),

  chats: () => request<ChatSummary[]>('GET', '/api/chats'),
  chat: (id: string) => request<Chat>('GET', `/api/chats/${id}`),
  createChat: (topic: string, politeness: Politeness) => request<Chat>('POST', '/api/chats', { topic, politeness }),
  renameChat: (id: string, title: string) => request<Chat>('PATCH', `/api/chats/${id}`, { title }),
  updateChat: (id: string, patch: Partial<Pick<Chat, 'title' | 'topic' | 'politeness'>>) => request<Chat>('PATCH', `/api/chats/${id}`, patch),
  deleteChat: (id: string) => request<{ ok: true }>('DELETE', `/api/chats/${id}`),
  send: (id: string, content: string) => request<Chat>('POST', `/api/chats/${id}/messages`, { content }),
  reply: (id: string) => request<Chat>('POST', `/api/chats/${id}/reply`),
  replyStatus: (id: string) => request<ReplyStatus>('GET', `/api/chats/${id}/reply`),
  saveDraft: (id: string, draft: string) => request<{ ok: true }>('PUT', `/api/chats/${id}/draft`, { draft }),
  /** `draft` is what is typed now, so the rewound text goes above it. */
  rewind: (id: string, messageId: string, draft: string) => request<Chat>('POST', `/api/chats/${id}/messages/${messageId}/rewind`, { draft }),
  undoRewind: (id: string) => request<Chat>('POST', `/api/chats/${id}/undo-rewind`),
  dismissPinned: (id: string) => request<Chat>('DELETE', `/api/chats/${id}/pinned`),
  analyze: (id: string, messageId: string, refresh = false) =>
    request<Message>('POST', `/api/chats/${id}/messages/${messageId}/analyze${refresh ? '?refresh=1' : ''}`),
};
