import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config.ts';
import type { Chat, Settings } from '../../shared/types.ts';
import { composer, expect, mockCalls, mockControl, startChat, test, theirs } from './fixtures.ts';

test('Refresh list and Test model keep the keyboard on themselves while they work', async ({ app, request }) => {
  const dialog = await openSettings(app);
  const refresh = dialog.getByRole('button', { name: /Refresh list/ });
  // Let the list the dialog fetches on opening arrive first, so the press below starts a refresh of its own.
  // (Not done until the models are in: the button reads not-busy for a moment before that fetch starts.)
  await expect(dialog.getByLabel('Model', { exact: true }).locator('option', { hasText: 'mock-large' })).toHaveCount(1);
  await expect(refresh).toHaveAttribute('aria-disabled', 'false');
  await mockControl(request, { delayMs: 1500 });
  await refresh.focus();
  await app.keyboard.press('Enter');
  await expect(refresh).toHaveAttribute('aria-disabled', 'true');
  await expect(refresh).toBeFocused();
  await expect(refresh).toHaveAttribute('aria-disabled', 'false');
  await expect(refresh).toBeFocused();

  const testButton = dialog.getByRole('button', { name: 'Test model' });
  await testButton.focus();
  await app.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: /Testing/ })).toBeFocused();
  await expect(dialog.locator('.model-test-result')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Test model' })).toBeFocused();
});

async function openSettings(page: Page) {
  await page.locator('.sidebar').getByRole('button', { name: /Settings|設定/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

const saved = async (request: APIRequestContext) => (await (await request.get('/api/settings')).json()) as Settings;

async function setLevel(page: Page, level: number) {
  const dialog = await openSettings(page);
  await dialog.getByRole('spinbutton', { name: 'Type a WaniKani level' }).fill(String(level));
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('kanji within the level keep their furigana and are not highlighted', async ({ app }) => {
  await startChat(app);
  await expect(theirs(app).first().locator('.kanji')).toHaveCount(2);
  await expect(theirs(app).first().locator('.over-level')).toHaveCount(0);
});

test('lowering the level leaves earlier messages judged by the level they were written at', async ({ app }) => {
  await startChat(app);
  await setLevel(app, 3);
  // 何 and 飲 are above level 3, but the opener was written at level 10.
  const message = theirs(app).first();
  await expect(message.locator('.kanji')).toHaveCount(2);
  await expect(message.locator('.over-level')).toHaveCount(0);
  await expect(message.locator('.kanji').first()).toHaveAttribute('title', /^何 — What · WaniKani level \d+/);
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  await expect(message.locator('.over-level')).toHaveCount(0);
});

test('a new reply at a low level spells those kanji out in kana', async ({ app }) => {
  await setLevel(app, 3);
  await startChat(app);
  await expect(theirs(app).first().locator('.bubble-text')).toHaveText('いらっしゃいませ！なにをのみますか？');
  await expect(theirs(app).first().locator('.over-level')).toHaveCount(0);
});

/** Rewrites the level a stored message was stamped with: the reply pipeline never lets a new one break its level. */
function stampLevel(chatId: string, index: number, wkLevel: number) {
  const file = path.join(DATA_DIR, 'chats', `${chatId}.json`);
  const chat = JSON.parse(fs.readFileSync(file, 'utf8')) as Chat;
  chat.messages[index].context!.wkLevel = wkLevel;
  fs.writeFileSync(file, JSON.stringify(chat));
}

test('kanji above the level a message was written at are marked, naming that level, whatever the level is now', async ({ app, request }) => {
  await startChat(app);
  const [chat] = (await (await request.get('/api/chats')).json()) as Chat[];
  // 何 is level 5 and 飲 level 10: written at 7, only 飲 is above it.
  stampLevel(chat.id, 0, 7);
  await app.reload();
  const over = theirs(app).first().locator('.over-level');
  await expect(over).toHaveCount(1);
  await expect(over).toHaveText('飲');
  await expect(over).toHaveAttribute('title', /^Above WaniKani level 7, the level this was written at\n飲 — Drink · WaniKani level 10/);

  // Raising the level now is saved, and doesn't change how the message is judged.
  const dialog = await openSettings(app);
  await dialog.getByRole('spinbutton', { name: 'Type a WaniKani level' }).fill('60');
  await expect(dialog).toContainText('levels 1–60');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  expect((await saved(request)).wkLevel).toBe(60);
  await expect(over).toHaveCount(1);
});

test('level 0 means kana only', async ({ app }) => {
  const dialog = await openSettings(app);
  await dialog.getByRole('spinbutton', { name: 'Type a WaniKani level' }).fill('0');
  await expect(dialog).toContainText('Kana only');
});

async function clearLevelBox(page: Page) {
  const dialog = await openSettings(page);
  const box = dialog.getByRole('spinbutton', { name: 'Type a WaniKani level' });
  await box.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  const slider = dialog.getByRole('slider', { name: 'WaniKani level', exact: true });
  return { dialog, box, slider, label: dialog.getByRole('group', { name: /^WaniKani level/ }).locator('strong') };
}

test('the level box can be emptied and retyped without a 0 creeping in', async ({ app, request }) => {
  const { dialog, box, slider, label } = await clearLevelBox(app);
  await expect(box).toHaveValue('');
  await box.pressSequentially('60');
  await expect(box).toHaveValue('60');
  await expect(label).toHaveText('60');
  await expect(slider).toHaveValue('60');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  expect((await saved(request)).wkLevel).toBe(60);
});

test('a fractional level is rounded, and label, slider and box agree', async ({ app, request }) => {
  const { dialog, box, slider, label } = await clearLevelBox(app);
  await box.pressSequentially('2.5');
  await expect(label).toHaveText('3');
  await expect(slider).toHaveValue('3');
  await box.press('Tab');
  await expect(box).toHaveValue('3');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  expect((await saved(request)).wkLevel).toBe(3);
});

test('a negative level becomes 0, and Enter in the box saves it', async ({ app, request }) => {
  const { box, label } = await clearLevelBox(app);
  await box.pressSequentially('-3');
  await expect(label).toHaveText('0');
  await box.press('Enter');
  await expect(app.getByRole('dialog')).toHaveCount(0);
  expect((await saved(request)).wkLevel).toBe(0);
});

for (const [typed, level] of [['2.5', 3], ['75', 60]] as const) {
  test(`Enter in the level box saves ${typed} as ${level}`, async ({ app, request }) => {
    const { box, label } = await clearLevelBox(app);
    await box.pressSequentially(typed);
    await expect(label).toHaveText(String(level));
    await box.press('Enter');
    await expect(app.getByRole('dialog')).toHaveCount(0);
    expect((await saved(request)).wkLevel).toBe(level);
  });
}

test('the Save button saves a level still typed as a fraction', async ({ app, request }) => {
  const { dialog, box } = await clearLevelBox(app);
  await box.pressSequentially('7.4');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  expect((await saved(request)).wkLevel).toBe(7);
});

test('leaving the level box empty keeps the level it had', async ({ app }) => {
  const { dialog, box, slider, label } = await clearLevelBox(app);
  await expect(label).toHaveText('10');
  await box.press('Tab');
  await expect(box).toHaveValue('10');
  await expect(slider).toHaveValue('10');
  await expect(dialog).toContainText('levels 1–10');
});

test('the WaniKani slider and number box are named apart, in a group, with the hint as their description', async ({ app }) => {
  const dialog = await openSettings(app);
  await expect(dialog.getByRole('group', { name: 'WaniKani level: 10' })).toBeVisible();
  const slider = dialog.getByRole('slider', { name: 'WaniKani level', exact: true });
  const box = dialog.getByRole('spinbutton', { name: 'Type a WaniKani level', exact: true });
  await expect(slider).toHaveValue('10');
  await expect(box).toHaveValue('10');
  await expect(slider).toHaveAccessibleDescription(/kanji from levels 1–10\./);
  await box.fill('4');
  await expect(slider).toHaveValue('4');
  await expect(box).toHaveAccessibleDescription(/kanji from levels 1–4\./);
  // Clicking the heading focuses the slider, as a label should.
  await dialog.locator('.field-label', { hasText: 'WaniKani level' }).click();
  await expect(slider).toBeFocused();
});

test('a select is named by its label alone, with its hint as the description', async ({ app }) => {
  const dialog = await openSettings(app);
  const genki = dialog.getByRole('combobox', { name: 'Genki lesson', exact: true });
  await expect(genki).toHaveAccessibleName('Genki lesson');
  await expect(genki).not.toHaveAccessibleDescription('');
  await expect(dialog.getByRole('combobox', { name: 'JLPT level', exact: true })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Endpoint URL', exact: true })).toBeVisible();
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

test('the Genki lesson is saved, and its hint follows the choice', async ({ app, request }) => {
  const dialog = await openSettings(app);
  const genki = dialog.getByLabel('Genki lesson');
  await expect(genki).toHaveValue('0');
  await expect(dialog).toContainText('Pick the last Genki lesson you’ve studied');
  await expect(genki.locator('option')).toHaveCount(24);
  await genki.selectOption({ label: 'Genki II · Lesson 14' });
  await expect(dialog).toContainText('grammar from Genki lessons 1–14');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await saved(request)).genkiLesson).toBe(14);
});

test('speech style is no longer a setting', async ({ app }) => {
  const dialog = await openSettings(app);
  await expect(dialog.getByText('Partner’s speech style')).toHaveCount(0);
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
  await expect(model.locator('option')).toHaveText(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
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
  await app.locator('.lang-switch label', { hasText: '日本語' }).click();
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
  await app.locator('.lang-switch label', { hasText: '日本語' }).click();
  await expect(app.getByRole('heading', { name: 'チャットで日本語を練習しよう' })).toBeVisible();
  await app.locator('.lang-switch label', { hasText: 'EN' }).click();
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
  await app.locator('.lang-switch label', { hasText: '日本語' }).click();
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
  expect((await mockCalls(request)).at(-1)).toEqual({ kind: 'chat', turns: 1, model: 'mock-small' });
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

test('the JLPT level is saved', async ({ app, request }) => {
  const dialog = await openSettings(app);
  const jlpt = dialog.getByLabel('JLPT level');
  await expect(jlpt).toHaveValue('0');
  await expect(jlpt.locator('option')).toHaveText(['Not set', 'N5 (beginner)', 'N4', 'N3', 'N2', 'N1 (advanced)']);
  await expect(dialog).toContainText('not a strict limit');
  await jlpt.selectOption({ label: 'N3' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await saved(request)).jlptLevel).toBe(3);
});

test('the endpoint\'s thinking setting is saved and sent to the model', async ({ app, request }) => {
  const dialog = await openSettings(app);
  const thinking = dialog.getByLabel('Thinking');
  await expect(thinking).toHaveValue('');
  await expect(thinking.locator('option')).toHaveText(['Model default', 'Off', 'Low', 'Medium', 'High']);
  await thinking.selectOption({ label: 'Off' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await saved(request)).endpoint.reasoning).toBe('none');
  await startChat(app);
  expect((await mockCalls(request)).at(-1)?.reasoning).toBe('none');
});

test('with no model chosen, a chat cannot be started and Settings is one click away', async ({ app, request }) => {
  await request.put('/api/settings', { data: { provider: 'endpoint', endpoint: { model: '' } } });
  await app.reload();
  await expect(app.locator('.empty .setup-notice')).toContainText('Choose a model first');

  await app.locator('.empty').getByRole('button', { name: '+ New chat' }).click();
  const dialog = app.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Start' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Open Settings' }).click();
  await expect(app.getByRole('dialog').getByRole('heading', { name: 'Settings' })).toBeVisible();
  const settings = app.getByRole('dialog');
  await expect(settings.locator('.warn-text')).toContainText('Without a model your partner can’t reply');

  await settings.getByLabel('Model', { exact: true }).selectOption('mock-small');
  await expect(settings.locator('.warn-text')).toHaveCount(0);
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(app.locator('.setup-notice')).toHaveCount(0);
  await startChat(app);
  expect((await saved(request)).endpoint.model).toBe('mock-small');
});

test('the model notice waits for the saved settings, and stays away if they never come', async ({ app }) => {
  // The defaults have no model, so a notice drawn before the settings arrive would be wrong for nearly everyone.
  await app.route('**/api/settings', (route) => (route.request().method() === 'GET' ? route.abort() : route.continue()));
  await app.reload();
  await expect(app.locator('.error')).toBeVisible();
  await expect(app.locator('.setup-notice')).toHaveCount(0);
  await app.locator('.empty').getByRole('button', { name: '+ New chat' }).click();
  await expect(app.getByRole('dialog').getByRole('button', { name: 'Start' })).toBeEnabled();
});

test('a chat that can\'t get a reply for want of a model offers Settings too', async ({ app, request }) => {
  await startChat(app);
  await request.put('/api/settings', { data: { provider: 'endpoint', endpoint: { model: '' } } });
  await app.reload();
  await composer(app).fill('こんにちは');
  await composer(app).press('Enter');
  const chat = app.locator('.chat');
  await expect(chat.locator('.error')).toContainText('no model chosen');
  await chat.locator('.setup-notice').getByRole('button', { name: 'Open Settings' }).click();
  await expect(app.getByRole('dialog').getByRole('heading', { name: 'Settings' })).toBeVisible();
});
