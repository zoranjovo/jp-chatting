import type { APIRequestContext, Page } from '@playwright/test';
import type { Settings } from '../../shared/types.ts';
import { expect, mockCalls, mockControl, startChat, test, theirs } from './fixtures.ts';

async function openSettings(page: Page) {
  await page.getByRole('button', { name: /Settings|設定/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

const saved = async (request: APIRequestContext) => (await (await request.get('/api/settings')).json()) as Settings;

async function setLevel(page: Page, level: number) {
  const dialog = await openSettings(page);
  await dialog.locator('input[type="number"]').fill(String(level));
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('kanji within the level keep their furigana and are not highlighted', async ({ app }) => {
  await startChat(app);
  await expect(theirs(app).first().locator('.kanji')).toHaveCount(2);
  await expect(theirs(app).first().locator('.over-level')).toHaveCount(0);
});

test('lowering the level highlights kanji above it, with details on hover', async ({ app }) => {
  await startChat(app);
  await setLevel(app, 3);
  const over = theirs(app).first().locator('.over-level');
  // 何 and 飲 are above level 3
  await expect(over).toHaveCount(2);
  await expect(over.first()).toHaveAttribute('title', /Above your WaniKani level\n何 — What · WaniKani level \d+/);
});

test('a new reply at a low level spells those kanji out in kana', async ({ app }) => {
  await setLevel(app, 3);
  await startChat(app);
  await expect(theirs(app).first().locator('.bubble-text')).toHaveText('いらっしゃいませ！なにをのみますか？');
  await expect(theirs(app).first().locator('.over-level')).toHaveCount(0);
});

test('raising the level in settings removes the highlights', async ({ app, request }) => {
  await startChat(app);
  await setLevel(app, 3);
  await expect(theirs(app).first().locator('.over-level')).toHaveCount(2);
  const dialog = await openSettings(app);
  await dialog.locator('input[type="number"]').fill('60');
  await expect(dialog).toContainText('levels 1–60');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(theirs(app).first().locator('.over-level')).toHaveCount(0);
  expect((await saved(request)).wkLevel).toBe(60);
});

test('level 0 means kana only', async ({ app }) => {
  const dialog = await openSettings(app);
  await dialog.locator('input[type="number"]').fill('0');
  await expect(dialog).toContainText('Kana only');
});

test('furigana can be turned off', async ({ app }) => {
  await startChat(app);
  await expect(theirs(app).first().locator('rt').first()).toHaveText('なに');
  const dialog = await openSettings(app);
  await dialog.getByLabel('Show furigana').uncheck();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(theirs(app).first().locator('rt')).toHaveCount(0);
  await expect(theirs(app).first()).toContainText('何を飲みますか');
});

test('Cancel discards changes', async ({ app, request }) => {
  const dialog = await openSettings(app);
  await dialog.getByLabel('Show furigana').uncheck();
  await dialog.locator('select').first().selectOption('ja');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  const s = await saved(request);
  expect(s.furigana).toBe(true);
  expect(s.uiLanguage).toBe('en');
});

test('speech style is saved', async ({ app, request }) => {
  const dialog = await openSettings(app);
  await dialog.getByLabel('Partner’s speech style').selectOption('casual');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await saved(request)).politeness).toBe('casual');
});

test('the endpoint\'s models are listed and the choice is saved', async ({ app, request }) => {
  const dialog = await openSettings(app);
  const model = dialog.getByLabel('Model', { exact: true });
  await expect(model.locator('option', { hasText: 'mock-large' })).toHaveCount(1);
  await model.selectOption('mock-large');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await saved(request)).endpoint.model).toBe('mock-large');
});

test('an unreachable endpoint shows why the list is empty', async ({ app }) => {
  const dialog = await openSettings(app);
  await dialog.getByLabel('Endpoint URL').fill('http://127.0.0.1:9/v1');
  await dialog.getByRole('button', { name: /Refresh list/ }).click();
  await expect(dialog.locator('.error-text')).toContainText('Could not list models');
});

test('the Claude CLI option lists its models and its own settings', async ({ app, request }) => {
  const dialog = await openSettings(app);
  await dialog.getByText('Claude Code CLI', { exact: true }).click();
  await expect(dialog.getByLabel('CLI command')).toHaveValue('claude');
  await expect(dialog.getByLabel('Effort')).toBeVisible();
  await expect(dialog.getByLabel('Endpoint URL')).toHaveCount(0);
  const model = dialog.getByLabel('Model', { exact: true });
  await expect(model.locator('option')).toHaveText(['Default (claude-sonnet-5-5)', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
  await model.selectOption('claude-haiku-5-5');
  await dialog.getByLabel('Effort').selectOption('low');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await saved(request)).provider).toBe('claude');
  const s = await saved(request);
  expect(s.claude.model).toBe('claude-haiku-5-5');
  expect(s.claude.effort).toBe('low');
});

test('the interface switches to Japanese and stays that way', async ({ app }) => {
  await startChat(app);
  await app.getByRole('button', { name: '日本語' }).click();
  await expect(app.getByRole('button', { name: '+ 新しいチャット' })).toBeVisible();
  await expect(theirs(app).first().getByRole('button', { name: '解説' })).toBeVisible();
  await expect(app.locator('html')).toHaveAttribute('lang', 'ja');

  await app.reload();
  await expect(app.getByRole('button', { name: '⚙ 設定' })).toBeVisible();
  const dialog = await openSettings(app);
  await expect(dialog.getByRole('heading', { name: '設定' })).toBeVisible();
  await expect(dialog).toContainText('WaniKaniレベル');
});

test('switching back to English', async ({ app }) => {
  await app.getByRole('button', { name: '日本語' }).click();
  await expect(app.getByRole('heading', { name: 'チャットで日本語を練習しよう' })).toBeVisible();
  await app.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(app.getByRole('heading', { name: 'Practise Japanese by chatting' })).toBeVisible();
});

test('choosing the Claude CLI shows the personal-use notice, with links to the terms', async ({ app }) => {
  const dialog = await openSettings(app);
  await expect(dialog.getByRole('note')).toHaveCount(0);
  await dialog.getByText('Claude Code CLI', { exact: true }).click();
  const notice = dialog.getByRole('note');
  await expect(notice).toContainText('For your own personal use only');
  await expect(notice).toContainText('Don’t host it for other people');
  await expect(notice.getByRole('link', { name: 'Consumer Terms' })).toHaveAttribute('href', 'https://www.anthropic.com/legal/consumer-terms');
  await expect(notice.getByRole('link', { name: 'Claude Code legal and compliance' })).toHaveAttribute('href', 'https://code.claude.com/docs/en/legal-and-compliance');
  await expect(notice.getByRole('link').first()).toHaveAttribute('target', '_blank');

  await dialog.getByText('Model endpoint').click();
  await expect(dialog.getByRole('note')).toHaveCount(0);
});

test('the personal-use notice is translated', async ({ app }) => {
  await app.getByRole('button', { name: '日本語' }).click();
  const dialog = await openSettings(app);
  await dialog.getByText('Claude Code CLI', { exact: true }).click();
  await expect(dialog.getByRole('note')).toContainText('自分だけの個人利用に限ります');
  await expect(dialog.getByRole('note').getByRole('link', { name: '消費者向け利用規約' })).toBeVisible();
});

test('Test model sends a message and shows the reply', async ({ app, request }) => {
  const dialog = await openSettings(app);
  await dialog.getByRole('button', { name: 'Test model' }).click();
  const result = dialog.getByRole('status');
  await expect(result).toContainText('It works — replied in');
  await expect(result).toContainText('いらっしゃいませ');
  expect((await mockCalls(request)).at(-1)).toEqual({ kind: 'chat', turns: 1 });
});

test('a failing model shows why', async ({ app, request }) => {
  await mockControl(request, { fail: true });
  const dialog = await openSettings(app);
  await dialog.getByRole('button', { name: 'Test model' }).click();
  await expect(dialog.getByRole('status')).toContainText('The test failed:');
  await expect(dialog.getByRole('status')).toContainText('mock model is down');
});

test('changing the model clears an old test result, and with no model the test is disabled', async ({ app }) => {
  const dialog = await openSettings(app);
  await dialog.getByRole('button', { name: 'Test model' }).click();
  await expect(dialog.getByRole('status')).toContainText('It works');
  await dialog.getByLabel('Model', { exact: true }).selectOption('mock-large');
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await dialog.getByLabel('Model', { exact: true }).selectOption('');
  await expect(dialog.getByRole('button', { name: 'Test model' })).toBeDisabled();
});

test('with Claude and no model picked, the default can still be tested', async ({ app }) => {
  const dialog = await openSettings(app);
  await dialog.getByText('Claude Code CLI', { exact: true }).click();
  await dialog.getByLabel('Model', { exact: true }).selectOption('');
  await expect(dialog.getByRole('button', { name: 'Test model' })).toBeEnabled();
});
