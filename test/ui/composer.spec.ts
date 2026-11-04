import { composer, expect, mine, startChat, test, theirs } from './fixtures.ts';

test('romaji typed key by key turns into kana', async ({ app }) => {
  await startChat(app);
  await composer(app).pressSequentially('watashi ha gakusei desu.');
  await expect(composer(app)).toHaveValue('わたし は がくせい です。');
});

test('CAPS romaji turns into katakana', async ({ app }) => {
  await startChat(app);
  await composer(app).pressSequentially('KO-HI-wo nomimasu');
  await expect(composer(app)).toHaveValue('コーヒーを のみます');
});

test('a trailing n becomes ん when the message is sent', async ({ app }) => {
  await startChat(app);
  await composer(app).pressSequentially('nihon');
  await expect(composer(app)).toHaveValue('にほn');
  await composer(app).press('Enter');
  await expect(mine(app).first()).toContainText('にほん');
});

test('editing in the middle keeps the caret where the user is typing', async ({ app }) => {
  await startChat(app);
  await composer(app).pressSequentially('おはよう');
  await composer(app).press('Home');
  await composer(app).pressSequentially('ne ');
  await expect(composer(app)).toHaveValue('ね おはよう');
  await composer(app).pressSequentially('a');
  await expect(composer(app)).toHaveValue('ね あおはよう');
});

test('with romaji input off, text is left as typed, and the choice is remembered', async ({ app }) => {
  await startChat(app);
  const toggle = app.locator('.romaji-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText('A');
  await composer(app).pressSequentially('hello');
  await expect(composer(app)).toHaveValue('hello');

  await app.reload();
  await expect(app.locator('.romaji-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('Shift+Enter makes a new line instead of sending', async ({ app }) => {
  await startChat(app);
  await composer(app).pressSequentially('hai');
  await composer(app).press('Shift+Enter');
  await composer(app).pressSequentially('iie');
  await expect(composer(app)).toHaveValue('はい\nいいえ');
  await expect(mine(app)).toHaveCount(0);
  await composer(app).press('Enter');
  await expect(mine(app)).toHaveCount(1);
});

test('blank messages are not sent', async ({ app }) => {
  await startChat(app);
  await expect(app.getByRole('button', { name: 'Send' })).toBeDisabled();
  await composer(app).fill('   ');
  await expect(app.getByRole('button', { name: 'Send' })).toBeDisabled();
  await composer(app).press('Enter');
  await expect(mine(app)).toHaveCount(0);
  await expect(theirs(app)).toHaveCount(1);
});

test('pasting a whole romaji sentence converts it', async ({ app }) => {
  await startChat(app);
  await composer(app).fill('arigatou gozaimasu!');
  await expect(composer(app)).toHaveValue('ありがとう ございます！');
});

test('kanji the learner has not learnt are not flagged in their own messages', async ({ app }) => {
  await startChat(app);
  // 鬱 is WaniKani level 50; the tests run at level 10.
  await composer(app).fill('鬱です');
  await composer(app).press('Enter');
  await expect(mine(app)).toHaveCount(1);
  await expect(mine(app).first().locator('.kanji')).toHaveCount(1);
  await expect(mine(app).first().locator('.over-level')).toHaveCount(0);
});

test('each chat keeps its own unsent draft', async ({ app }) => {
  await startChat(app, 'First');
  await composer(app).pressSequentially('toukyou made');
  await expect(composer(app)).toHaveValue('とうきょう まで');

  await startChat(app, 'Second');
  await expect(composer(app)).toHaveValue('');
  await composer(app).pressSequentially('oosaka');

  await app.locator('.chat-item', { hasText: 'First' }).locator('.chat-item-main').click();
  await expect(app.locator('h1')).toHaveText('First');
  await expect(composer(app)).toHaveValue('とうきょう まで');

  await app.locator('.chat-item', { hasText: 'Second' }).locator('.chat-item-main').click();
  await expect(composer(app)).toHaveValue('おおさか');
});

test("a rewound message stays in its own chat's composer", async ({ app }) => {
  await startChat(app, 'First');
  await composer(app).fill('コーヒーをください。');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  await mine(app).first().getByRole('button', { name: 'Rewind' }).click();
  await expect(composer(app)).toHaveValue('コーヒーをください。');

  await startChat(app, 'Second');
  await expect(composer(app)).toHaveValue('');
});

test('a message that fails to send goes back in the composer', async ({ app }) => {
  await startChat(app);
  await app.route('**/api/chats/*/messages', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
  await composer(app).fill('コーヒーをください。');
  await composer(app).press('Enter');
  await expect(app.locator('.chat .error')).toBeVisible();
  await expect(composer(app)).toHaveValue('コーヒーをください。');
  await expect(mine(app)).toHaveCount(0);
});

test('a rewind that finishes after switching chats puts the text in its own chat\'s draft', async ({ app }) => {
  await startChat(app, 'First');
  await composer(app).fill('コーヒーをください。');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  await startChat(app, 'Second');

  await app.locator('.chat-item', { hasText: 'First' }).locator('.chat-item-main').click();
  await expect(app.locator('h1')).toHaveText('First');
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await app.route('**/rewind', async (route) => {
    await held;
    await route.continue();
  });
  await mine(app).first().getByRole('button', { name: 'Rewind' }).click();
  await app.locator('.chat-item', { hasText: 'Second' }).locator('.chat-item-main').click();
  await expect(app.locator('h1')).toHaveText('Second');
  release();
  await expect(composer(app)).toHaveValue('');

  await app.locator('.chat-item', { hasText: 'First' }).locator('.chat-item-main').click();
  await expect(app.locator('h1')).toHaveText('First');
  await expect(composer(app)).toHaveValue('コーヒーをください。');
});
