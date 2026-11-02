import type { Page } from '@playwright/test';
import { chatsOnDisk, composer, expect, mine, mockCalls, mockControl, startChat, test, theirs } from './fixtures.ts';

test('the empty state invites starting a chat', async ({ app }) => {
  await expect(app.getByRole('heading', { name: 'Practise Japanese by chatting' })).toBeVisible();
  await expect(app.getByText('No chats yet.')).toBeVisible();
});

test('a new chat with a topic gets an opener from the partner', async ({ app, request }) => {
  await app.getByRole('button', { name: '+ New chat' }).first().click();
  const dialog = app.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Start a new chat' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Ordering at a café' }).click();
  await expect(dialog.getByRole('textbox')).toHaveValue('Ordering at a café');
  await dialog.getByRole('button', { name: 'Start' }).click();

  await expect(theirs(app).first()).toContainText('いらっしゃいませ！');
  await expect(app.locator('.topic-banner')).toHaveText('Ordering at a café');
  await expect(app.locator('.topbar h1')).toHaveText('Ordering at a café');
  await expect(app.locator('.chat-item.active .chat-title')).toHaveText('Ordering at a café');

  const [chat] = await chatsOnDisk(request);
  expect(chat.topic).toBe('Ordering at a café');
  expect(chat.messages).toHaveLength(1);
  expect((await mockCalls(request))[0]).toEqual({ kind: 'chat', turns: 1, model: 'mock-small' });
});

test('a chat without a topic is named after the opener', async ({ app }) => {
  await startChat(app);
  await expect(app.locator('.chat-item.active .chat-title')).toHaveText('いらっしゃいませ！何を飲みますか？');
});

test('cancelling the new chat dialog starts nothing', async ({ app, request }) => {
  await app.getByRole('button', { name: '+ New chat' }).first().click();
  await app.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  expect(await chatsOnDisk(request)).toHaveLength(0);
});

test('Escape closes the new chat dialog', async ({ app }) => {
  await app.getByRole('button', { name: '+ New chat' }).first().click();
  await expect(app.getByRole('dialog')).toBeVisible();
  await app.keyboard.press('Escape');
  await expect(app.getByRole('dialog')).toHaveCount(0);
});

test('sending a message gets a reply that saw the history', async ({ app, request }) => {
  await startChat(app);
  await composer(app).fill('はい、コーヒーをください。');
  await app.getByRole('button', { name: 'Send' }).click();

  await expect(mine(app)).toHaveCount(1);
  await expect(mine(app).first()).toContainText('はい、コーヒーをください。');
  await expect(theirs(app)).toHaveCount(2);
  await expect(theirs(app).nth(1)).toContainText('サイズ');
  await expect(composer(app)).toHaveValue('');

  const chatCalls = (await mockCalls(request)).filter((c) => c.kind === 'chat');
  expect(chatCalls.at(-1)!.turns).toBe(3);
  const [chat] = await chatsOnDisk(request);
  expect(chat.messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant']);
});

test('the typing indicator shows while waiting and sending is blocked', async ({ app, request }) => {
  await startChat(app);
  await mockControl(request, { delayMs: 1500 });
  await composer(app).fill('はい');
  await composer(app).press('Enter');
  await expect(app.locator('.typing')).toBeVisible();
  await composer(app).fill('もう一つ');
  await expect(app.getByRole('button', { name: 'Send' })).toBeDisabled();
  await expect(app.locator('.typing')).toHaveCount(0, { timeout: 5_000 });
  await expect(app.getByRole('button', { name: 'Send' })).toBeEnabled();
});

test('chats survive a reload and the newest opens first', async ({ app }) => {
  await startChat(app, 'First chat');
  await startChat(app, 'Second chat');
  await app.reload();
  await expect(app.locator('.topbar h1')).toHaveText('Second chat');
  await expect(app.locator('.chat-item')).toHaveCount(2);
  await expect(theirs(app)).toHaveCount(1);
});

test('switching chats shows each chat\'s own messages', async ({ app }) => {
  await startChat(app, 'One');
  await composer(app).fill('ひとつめ');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  await startChat(app, 'Two');
  await expect(mine(app)).toHaveCount(0);

  await app.locator('.chat-item', { hasText: 'One' }).locator('.chat-item-main').click();
  await expect(app.locator('.topbar h1')).toHaveText('One');
  await expect(mine(app)).toHaveCount(1);
  await expect(mine(app).first()).toContainText('ひとつめ');
});

test('a failed reply shows the error and can be retried', async ({ app, request }) => {
  await mockControl(request, { fail: true });
  await app.getByRole('button', { name: '+ New chat' }).first().click();
  await app.getByRole('dialog').getByRole('button', { name: 'Start' }).click();
  await expect(app.locator('.error')).toContainText('mock model is down');
  const retry = app.getByRole('button', { name: 'Get a reply' });
  await expect(retry).toBeVisible();

  await mockControl(request, { fail: false });
  await retry.click();
  await expect(theirs(app)).toHaveCount(1);
  await expect(app.locator('.error')).toHaveCount(0);
  await expect(retry).toHaveCount(0);
});

test('a failed reply keeps the learner\'s message', async ({ app, request }) => {
  await startChat(app);
  await mockControl(request, { fail: true });
  await composer(app).fill('きこえますか');
  await composer(app).press('Enter');
  await expect(app.locator('.error')).toBeVisible();
  await expect(mine(app)).toHaveCount(1);
  await mockControl(request, { fail: false });
  await app.getByRole('button', { name: 'Get a reply' }).click();
  await expect(theirs(app)).toHaveCount(2);
});

const chatSettingsButton = (app: Page) => app.locator('.topbar').getByRole('button', { name: 'Chat settings' });

async function openChatSettings(app: Page) {
  await chatSettingsButton(app).click();
  const dialog = app.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Chat settings' })).toBeVisible();
  return dialog;
}

test('a new chat takes the speech style chosen when starting it', async ({ app, request }) => {
  await app.getByRole('button', { name: '+ New chat' }).first().click();
  const dialog = app.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: 'Polite (です/ます)' })).toBeChecked();
  await dialog.getByText('Casual (plain form)').click();
  await dialog.getByRole('button', { name: 'Start' }).click();
  await expect(theirs(app)).toHaveCount(1);
  await expect(chatSettingsButton(app)).toContainText('Casual');
  expect((await chatsOnDisk(request))[0].politeness).toBe('casual');
});

test('the chat settings pane changes the title, topic and speech style', async ({ app, request }) => {
  await startChat(app, 'Style');
  await expect(chatSettingsButton(app)).toContainText('Polite');
  const dialog = await openChatSettings(app);
  await expect(dialog.getByLabel('Title')).toHaveValue('Style');
  await expect(dialog.getByRole('radio', { name: 'Polite (です/ます)' })).toBeChecked();
  await dialog.getByLabel('Title').fill('Weekend');
  await dialog.getByLabel('Topic or scenario (optional)').fill('Weekend plans');
  await dialog.getByText('Casual (plain form)').click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(chatSettingsButton(app)).toContainText('Casual');
  await expect(app.locator('.topbar h1')).toHaveText('Weekend');
  await expect(app.locator('.topic-banner')).toHaveText('Weekend plans');
  await expect(app.locator('.chat-item.active .chat-title')).toHaveText('Weekend');
  const [chat] = await chatsOnDisk(request);
  expect([chat.title, chat.topic, chat.politeness]).toEqual(['Weekend', 'Weekend plans', 'casual']);
  await app.reload();
  await expect(chatSettingsButton(app)).toContainText('Casual');
});

test('cancelling the chat settings pane changes nothing', async ({ app, request }) => {
  await startChat(app, 'Style');
  const dialog = await openChatSettings(app);
  await dialog.getByText('Casual (plain form)').click();
  await dialog.getByLabel('Title').fill('Other');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(chatSettingsButton(app)).toContainText('Polite');
  const [chat] = await chatsOnDisk(request);
  expect([chat.title, chat.politeness]).toEqual(['Style', 'polite']);
});

test('each chat keeps its own speech style', async ({ app }) => {
  await startChat(app, 'Polite one');
  await app.getByRole('button', { name: '+ New chat' }).first().click();
  await app.getByRole('dialog').getByText('Casual (plain form)').click();
  await app.getByRole('dialog').getByRole('button', { name: 'Start' }).click();
  await expect(app.locator('.topbar h1')).not.toHaveText('Polite one');
  await expect(chatSettingsButton(app)).toContainText('Casual');
  await app.locator('.chat-item', { hasText: 'Polite one' }).locator('.chat-item-main').click();
  await expect(chatSettingsButton(app)).toContainText('Polite');
});

test('each message shows the settings it was written with, and keeps them after they change', async ({ app, request }) => {
  await startChat(app);
  await composer(app).fill('はい');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  const stamp = 'mock-small · Polite · WK 10';
  await expect(app.locator('.message-meta')).toHaveText([stamp, stamp, stamp]);

  await request.put('/api/settings', { data: { endpoint: { model: 'mock-large' }, wkLevel: 20, jlptLevel: 3 } });
  await app.reload();
  await expect(app.locator('.message-meta')).toHaveText([stamp, stamp, stamp]);
  const dialog = await openChatSettings(app);
  await expect(dialog.locator('.chat-uses')).toHaveText('mock-large · Polite · WK 20 · N3');
  await dialog.getByText('Casual (plain form)').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await app.reload();
  await expect(app.locator('.message-meta')).toHaveText([stamp, stamp, stamp]);
  await expect(theirs(app).first().locator('.message-meta')).toHaveAttribute('title', /Its breakdown or feedback uses them too/);

  await theirs(app).first().getByRole('button', { name: 'Breakdown' }).click();
  await expect(theirs(app).first().locator('.breakdown-lines')).toBeVisible();
  await mine(app).first().getByRole('button', { name: 'Check' }).click();
  await expect(mine(app).first().locator('.feedback')).toBeVisible();
  const calls = await mockCalls(request);
  expect(calls.filter((c) => c.kind === 'breakdown' || c.kind === 'feedback').map((c) => c.model)).toEqual(['mock-small', 'mock-small']);
});

test('the next message after a change is stamped with the new settings', async ({ app, request }) => {
  await startChat(app);
  const dialog = await openChatSettings(app);
  await dialog.getByText('Casual (plain form)').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await composer(app).fill('うん');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  await expect(app.locator('.message-meta')).toHaveText(['mock-small · Polite · WK 10', 'mock-small · Casual · WK 10', 'mock-small · Casual · WK 10']);
  expect((await chatsOnDisk(request))[0].messages.map((m) => m.context?.politeness)).toEqual(['polite', 'casual', 'casual']);
});

async function sendAndWait(app: Page, text: string) {
  const replies = await theirs(app).count();
  await composer(app).fill(text);
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(replies + 1);
}

test('rewind deletes my message and everything after it, and puts it back in the box', async ({ app, request }) => {
  await startChat(app);
  await sendAndWait(app, 'コーヒーをください');
  await sendAndWait(app, 'ありがとう');
  await expect(theirs(app).first().getByRole('button', { name: /Rewind/ })).toHaveCount(0);

  await mine(app).first().getByRole('button', { name: /Rewind/ }).click();
  await expect(mine(app)).toHaveCount(0);
  await expect(theirs(app)).toHaveCount(1);
  await expect(composer(app)).toHaveValue('コーヒーをください');
  await expect(composer(app)).toBeFocused();
  expect((await chatsOnDisk(request))[0].messages).toHaveLength(1);

  await composer(app).press('Enter');
  await expect(mine(app)).toHaveCount(1);
  await expect(theirs(app)).toHaveCount(2);
});

test('rewinding with something already typed puts the message above it, with a blank line between', async ({ app }) => {
  await startChat(app);
  await sendAndWait(app, 'もも');
  await composer(app).fill('おいしいトマト');
  await mine(app).first().getByRole('button', { name: /Rewind/ }).click();
  await expect(mine(app)).toHaveCount(0);
  await expect(composer(app)).toHaveValue('もも\n\nおいしいトマト');
});

test('rewind waits while a reply is on its way', async ({ app, request }) => {
  await startChat(app);
  await sendAndWait(app, 'はい');
  await mockControl(request, { delayMs: 1500 });
  await composer(app).fill('もういちど');
  await composer(app).press('Enter');
  await expect(app.locator('.typing')).toBeVisible();
  await expect(mine(app).first().getByRole('button', { name: /Rewind/ })).toBeDisabled();
  await expect(app.locator('.typing')).toHaveCount(0);
  await expect(mine(app).first().getByRole('button', { name: /Rewind/ })).toBeEnabled();
});
