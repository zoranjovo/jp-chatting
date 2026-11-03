import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { Chat, ChatSummary, Settings } from '../../shared/types.ts';
import { MOCK_PORT } from '../../playwright.config.ts';

export const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

export const TEST_SETTINGS: Partial<Settings> = {
  uiLanguage: 'en',
  wkLevel: 10,
  furigana: true,
  genkiLesson: 0,
  jlptLevel: 0,
  romajiInput: true,
  provider: 'endpoint',
  endpoint: { baseUrl: `${MOCK_URL}/v1`, apiKey: '', model: 'mock-small', reasoning: '' },
  claude: { command: 'claude', model: 'claude-sonnet-5-5', effort: '', timeoutMs: 180_000 },
};

export async function resetApp(request: APIRequestContext) {
  const chats = (await (await request.get('/api/chats')).json()) as ChatSummary[];
  for (const chat of chats) await request.delete(`/api/chats/${chat.id}`);
  await request.put('/api/settings', { data: TEST_SETTINGS });
  await request.post(`${MOCK_URL}/__reset`);
}

export async function mockCalls(request: APIRequestContext): Promise<{ kind: string; turns: number; model: string; reasoning?: string }[]> {
  return (await request.get(`${MOCK_URL}/__calls`)).json();
}

export async function mockControl(request: APIRequestContext, control: { fail?: boolean; delayMs?: number }) {
  await request.post(`${MOCK_URL}/__control`, { data: control });
}

/** Starts a chat through the UI and waits for the partner's opener. */
export async function startChat(page: Page, topic = '') {
  const before = await page.locator('.chat-item').count();
  // The sidebar's button, or on a phone, where the sidebar is slid off screen, the top bar's.
  const buttons = page.getByRole('button', { name: /New chat/ });
  for (let i = 0; i < (await buttons.count()); i += 1) {
    const box = await buttons.nth(i).boundingBox();
    if (box && box.x >= 0) {
      await buttons.nth(i).click();
      break;
    }
  }
  const dialog = page.getByRole('dialog');
  if (topic) await dialog.getByRole('textbox').fill(topic);
  await dialog.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.chat-item')).toHaveCount(before + 1);
  await expect(page.locator('.message.theirs')).toHaveCount(1);
  await expect(page.locator('.typing')).toHaveCount(0);
}

export const theirs = (page: Page) => page.locator('.message.theirs');
export const mine = (page: Page) => page.locator('.message.mine');
export const composer = (page: Page) => page.locator('.composer textarea');

export async function chatsOnDisk(request: APIRequestContext): Promise<Chat[]> {
  const list = (await (await request.get('/api/chats')).json()) as ChatSummary[];
  return Promise.all(list.map(async (c) => (await request.get(`/api/chats/${c.id}`)).json()));
}

export const test = base.extend<{ app: Page }>({
  app: async ({ page, request }, use) => {
    await resetApp(request);
    await page.goto('/');
    await use(page);
  },
});

export { expect };
