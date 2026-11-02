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
  expect((await mockCalls(request))[0]).toEqual({ kind: 'chat', turns: 1 });
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

test('a new chat takes the speech style chosen when starting it', async ({ app, request }) => {
  await app.getByRole('button', { name: '+ New chat' }).first().click();
  const dialog = app.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: 'Polite (です/ます)' })).toBeChecked();
  await dialog.getByText('Casual (plain form)').click();
  await dialog.getByRole('button', { name: 'Start' }).click();
  await expect(theirs(app)).toHaveCount(1);
  await expect(app.locator('.topbar').getByRole('radio', { name: 'Casual' })).toBeChecked();
  expect((await chatsOnDisk(request))[0].politeness).toBe('casual');
});

test('the top bar switches the open chat\'s speech style', async ({ app, request }) => {
  await startChat(app, 'Style');
  const topbar = app.locator('.topbar');
  await expect(topbar.getByRole('radio', { name: 'Polite' })).toBeChecked();
  await topbar.getByText('Casual', { exact: true }).click();
  await expect(topbar.getByRole('radio', { name: 'Casual' })).toBeChecked();
  await expect.poll(async () => (await chatsOnDisk(request))[0].politeness).toBe('casual');
  await app.reload();
  await expect(app.locator('.topbar').getByRole('radio', { name: 'Casual' })).toBeChecked();
});

test('each chat keeps its own speech style', async ({ app }) => {
  await startChat(app, 'Polite one');
  await app.getByRole('button', { name: '+ New chat' }).first().click();
  await app.getByRole('dialog').getByText('Casual (plain form)').click();
  await app.getByRole('dialog').getByRole('button', { name: 'Start' }).click();
  await expect(app.locator('.topbar h1')).not.toHaveText('Polite one');
  await expect(app.locator('.topbar').getByRole('radio', { name: 'Casual' })).toBeChecked();
  await app.locator('.chat-item', { hasText: 'Polite one' }).locator('.chat-item-main').click();
  await expect(app.locator('.topbar').getByRole('radio', { name: 'Polite' })).toBeChecked();
});
