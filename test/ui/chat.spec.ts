import type { Page } from '@playwright/test';
import { chatsOnDisk, composer, expect, expectTooltipBeside, mine, mockCalls, mockControl, startChat, test, theirs } from './fixtures.ts';

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

test('a reply still being written when the page reloads shows up without another reload', async ({ app, request }) => {
  await startChat(app);
  await mockControl(request, { delayMs: 2500 });
  await composer(app).fill('きこえますか');
  await composer(app).press('Enter');
  await expect(app.locator('.typing')).toBeVisible();
  await app.reload();
  await expect(mine(app)).toHaveCount(1);
  await expect(app.locator('.typing')).toBeVisible();
  await expect(composer(app).locator('xpath=..').getByRole('button', { name: 'Send' })).toBeDisabled();
  await expect(theirs(app)).toHaveCount(2);
  await expect(app.locator('.typing')).toHaveCount(0);
  expect((await mockCalls(request)).filter((c) => c.kind === 'chat')).toHaveLength(2);
});

test('after a failed reply and a reload, the reply can still be asked for', async ({ app, request }) => {
  await startChat(app);
  await mockControl(request, { fail: true });
  await composer(app).fill('きこえますか');
  await composer(app).press('Enter');
  await expect(app.locator('.error')).toBeVisible();
  await app.reload();
  await expect(mine(app)).toHaveCount(1);
  const retry = app.getByRole('button', { name: 'Get a reply' });
  await expect(retry).toBeVisible();
  await mockControl(request, { fail: false });
  await retry.click();
  await expect(theirs(app)).toHaveCount(2);
});

test('screen readers hear that the partner is typing, then what it said, and errors as alerts', async ({ app, request }) => {
  await startChat(app);
  const status = app.locator('.chat > [role="status"]');
  await expect(status).toHaveText(/^Your partner: いらっしゃいませ/);
  await mockControl(request, { delayMs: 800 });
  await composer(app).fill('コーヒーをください');
  await composer(app).press('Enter');
  await expect(status).toHaveText('Typing…');
  await expect(theirs(app)).toHaveCount(2);
  await expect(status).toHaveText(/^Your partner: はい、大きいサイズと小さいサイズ/);

  await mockControl(request, { delayMs: 0, fail: true });
  await composer(app).fill('もしもし');
  await composer(app).press('Enter');
  await expect(app.getByRole('alert')).toContainText('mock model is down');
});

test('a chat opened from the list does not read out its old messages', async ({ app }) => {
  await startChat(app, 'One');
  await startChat(app, 'Two');
  await app.locator('.chat-item', { hasText: 'One' }).locator('.chat-item-main').click();
  await expect(app.locator('h1')).toHaveText('One');
  await expect(app.locator('.chat > [role="status"]')).toHaveText('');
});

const focused = (app: Page) => app.evaluate(() => {
  const el = document.activeElement;
  return el ? `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''}:${el.textContent?.trim() ?? ''}` : '';
});

test('starting a chat puts the keyboard in its composer', async ({ app }) => {
  await startChat(app);
  expect(await focused(app)).toMatch(/^textarea/);
});

test('switching to another chat afterwards leaves focus where the learner put it', async ({ app }) => {
  await startChat(app, 'One');
  await startChat(app, 'Two');
  const one = app.locator('.chat-item', { hasText: 'One' }).locator('.chat-item-main');
  await one.focus();
  await app.keyboard.press('Enter');
  await expect(app.locator('h1')).toHaveText('One');
  await expect(one).toBeFocused();
});

test('"Get a reply" leaves the keyboard in the composer, not on the page', async ({ app, request }) => {
  await startChat(app);
  await mockControl(request, { fail: true });
  await composer(app).fill('きこえますか');
  await composer(app).press('Enter');
  await expect(app.locator('.error')).toBeVisible();
  await mockControl(request, { fail: false });
  await app.getByRole('button', { name: 'Get a reply' }).focus();
  await app.keyboard.press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  expect(await focused(app)).toMatch(/^textarea/);
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

/** Opens a partner message's ⓘ and returns its rows as "Label: value". */
async function messageInfo(app: Page, index: number) {
  const message = theirs(app).nth(index);
  await message.getByRole('button', { name: 'How this message was written' }).click();
  const pop = app.locator('.message-info-pop');
  await expect(pop).toBeVisible();
  const rows = await pop.locator('.message-info-list > div').evaluateAll((divs) =>
    divs.map((d) => `${d.querySelector('dt')?.textContent}: ${d.querySelector('dd')?.textContent}`),
  );
  await app.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  return rows.slice(0, -1); // all but "Written", which has the time
}

const MOCK_INFO = [
  'Model: mock-small',
  'AI provider: Model endpoint (OpenAI-compatible)',
  'Thinking: Model default',
  'Partner’s speech style: Polite (です/ます)',
  'WaniKani level: 10',
  'Genki lesson: Not using Genki',
  'JLPT level: Not set',
];

test('the partner\'s messages show how they were written, and keep it after the settings change', async ({ app, request }) => {
  await startChat(app);
  await composer(app).fill('はい');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  await expect(mine(app).first().getByRole('button', { name: 'How this message was written' })).toHaveCount(0);
  expect(await messageInfo(app, 0)).toEqual(MOCK_INFO);

  await request.put('/api/settings', { data: { endpoint: { model: 'mock-large' }, wkLevel: 20, jlptLevel: 3 } });
  await app.reload();
  const dialog = await openChatSettings(app);
  await expect(dialog.locator('.chat-uses')).toHaveText('mock-large · Polite · WK 20 · N3');
  await dialog.getByText('Casual (plain form)').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await app.reload();
  expect(await messageInfo(app, 0)).toEqual(MOCK_INFO);
  expect(await messageInfo(app, 1)).toEqual(MOCK_INFO);

  await theirs(app).first().getByRole('button', { name: 'Breakdown' }).click();
  await expect(theirs(app).first().locator('.breakdown-lines')).toBeVisible();
  await mine(app).first().getByRole('button', { name: 'Check' }).click();
  await expect(mine(app).first().locator('.feedback')).toBeVisible();
  const calls = await mockCalls(request);
  expect(calls.filter((c) => c.kind === 'breakdown' || c.kind === 'feedback').map((c) => c.model)).toEqual(['mock-small', 'mock-small']);
});

test('the info closes on a click elsewhere', async ({ app }) => {
  await startChat(app);
  await theirs(app).first().getByRole('button', { name: 'How this message was written' }).click();
  await expect(app.locator('.message-info-pop')).toContainText('Its breakdown uses these settings too');
  await app.locator('.topbar h1').click();
  await expect(app.locator('.message-info-pop')).toHaveCount(0);
});

test('the info pops up on hover, stays while the pointer moves into it, and goes when it leaves', async ({ app }) => {
  await startChat(app);
  await theirs(app).first().getByRole('button', { name: 'How this message was written' }).hover();
  const pop = app.locator('.message-info-pop');
  await expect(pop).toContainText('Model');
  await pop.hover();
  await expect(pop).toBeVisible();
  await app.locator('.topbar h1').hover();
  await expect(pop).toHaveCount(0);
});

test('the message actions are icons that name themselves on hover', async ({ app }) => {
  await startChat(app);
  await sendAndWait(app, 'はい');
  const tooltip = app.locator('.tooltip');
  for (const [message, name] of [
    [theirs(app).first(), 'Breakdown'],
    [mine(app).first(), 'Check'],
    [mine(app).first(), 'Rewind'],
  ] as const) {
    await message.getByRole('button', { name }).hover();
    await expect(tooltip).toHaveCount(1);
    await expect(tooltip.locator('strong')).toHaveText(name);
  }
  await expect(tooltip).toContainText('Delete this message and everything after it');
  await expect(mine(app).first().getByRole('button', { name: 'Rewind' })).toHaveAccessibleDescription(
    /Delete this message and everything after it/,
  );

  await theirs(app).first().getByRole('button', { name: 'Breakdown' }).click();
  await expect(tooltip.locator('strong')).toHaveText('Hide');
});

test('the action tooltips leave the message text uncovered, on hover and on keyboard focus', async ({ app }) => {
  await startChat(app);
  await sendAndWait(app, 'はい');
  for (const [message, name] of [
    [theirs(app).first(), 'Breakdown'],
    [mine(app).first(), 'Check'],
    [mine(app).first(), 'Rewind'],
  ] as const) {
    const button = message.getByRole('button', { name });
    await button.hover();
    await expectTooltipBeside(app, button, message.locator('.bubble-text'));
    await app.locator('.topbar h1').hover();
    await expect(app.locator('.tooltip')).toHaveCount(0);
  }

  // Tab, not focus(): the tooltips open on focus only when it is visible, as after a key.
  const message = mine(app).first();
  await message.getByRole('button', { name: 'Rewind' }).focus();
  await app.keyboard.press('Tab');
  await expectTooltipBeside(app, message.getByRole('button', { name: 'Check' }), message.locator('.bubble-text'));
  await app.keyboard.press('Shift+Tab');
  await expectTooltipBeside(app, message.getByRole('button', { name: 'Rewind' }), message.locator('.bubble-text'));
});

test('a tooltip goes away once its button scrolls out of view', async ({ app }) => {
  await app.setViewportSize({ width: 1000, height: 420 });
  await startChat(app);
  for (const text of ['コーヒーをください', 'ありがとう', 'はい', 'またね']) await sendAndWait(app, text);
  const message = mine(app).first();
  await message.getByRole('button', { name: 'Rewind' }).focus();
  await app.keyboard.press('Tab');
  // Rewind's tooltip may still be fading out for a moment, so look for Check's by its text.
  await expect(app.locator('.tooltip', { hasText: 'Check' })).toBeVisible();

  await app.locator('.messages').evaluate((list) => list.scrollTo({ top: list.scrollHeight }));
  await expect(message.getByRole('button', { name: 'Check' })).not.toBeInViewport();
  await expect(message.getByRole('button', { name: 'Check' })).toBeFocused();
  await expect(app.locator('.tooltip')).toHaveCount(0);
});

test('the next message after a change is stamped with the new settings', async ({ app, request }) => {
  await startChat(app);
  const dialog = await openChatSettings(app);
  await dialog.getByText('Casual (plain form)').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await composer(app).fill('うん');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  expect(await messageInfo(app, 1)).toContain('Partner’s speech style: Casual (plain form)');
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
