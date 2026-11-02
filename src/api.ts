import type { Chat, ChatSummary, Message, ModelList, ModelTest, Politeness, ProviderKind, Settings } from '../shared/types.ts';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${res.status} ${res.statusText}`);
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
  rewind: (id: string, messageId: string) => request<Chat>('POST', `/api/chats/${id}/messages/${messageId}/rewind`),
  analyze: (id: string, messageId: string, refresh = false) =>
    request<Message>('POST', `/api/chats/${id}/messages/${messageId}/analyze${refresh ? '?refresh=1' : ''}`),
};
