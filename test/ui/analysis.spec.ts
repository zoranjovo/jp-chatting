import { chatsOnDisk, composer, expect, mine, mockCalls, startChat, test, theirs } from './fixtures.ts';

const count = async (request: Parameters<typeof mockCalls>[0], kind: string) => (await mockCalls(request)).filter((c) => c.kind === kind).length;

test('Breakdown shows each line with its translation, explanation and words', async ({ app }) => {
  await startChat(app);
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();

  const lines = message.locator('.analysis-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0).locator('.line-en')).toHaveText('Welcome!');
  await expect(lines.nth(1).locator('.line-en')).toHaveText('What will you drink?');
  await expect(lines.nth(1).locator('.line-explain')).toContainText('を marks the object');
  await expect(lines.nth(1).locator('.word')).toHaveCount(2);
  await expect(lines.nth(1).locator('.word').first()).toContainText('what');
});

test('Breakdown is fetched once, then hidden and shown from the cache', async ({ app, request }) => {
  await startChat(app);
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);

  await message.getByRole('button', { name: 'Hide' }).click();
  await expect(message.locator('.analysis')).toHaveCount(0);
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  expect(await count(request, 'breakdown')).toBe(1);
});

test('a breakdown is saved and still there after a reload', async ({ app, request }) => {
  await startChat(app);
  await theirs(app).first().getByRole('button', { name: 'Breakdown' }).click();
  await expect(theirs(app).first().locator('.analysis-line')).toHaveCount(2);
  await app.reload();
  await theirs(app).first().getByRole('button', { name: 'Breakdown' }).click();
  await expect(theirs(app).first().locator('.analysis-line')).toHaveCount(2);
  expect(await count(request, 'breakdown')).toBe(1);
  expect((await chatsOnDisk(request))[0].messages[0].breakdown?.lines).toHaveLength(2);
});

test('Redo asks for a fresh breakdown', async ({ app, request }) => {
  await startChat(app);
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  await message.getByRole('button', { name: 'Redo' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  await expect.poll(() => count(request, 'breakdown')).toBe(2);
});

test('Check gives feedback on the learner\'s message', async ({ app }) => {
  await startChat(app);
  await composer(app).fill('コーヒーがおねがいします。');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);

  const message = mine(app).first();
  await message.getByRole('button', { name: 'Check' }).click();
  await expect(message.locator('.verdict')).toHaveText('Almost — small fixes');
  await expect(message.locator('.feedback-summary')).toContainText('Use を');
  await expect(message.locator('.feedback-overall')).toContainText('A coffee, please.');
  await expect(message.locator('.strike')).toHaveText('コーヒーがおねがいします。');
  await expect(message.locator('.line-fix')).toHaveCount(1);
});

test('the partner\'s and the learner\'s analyses are independent', async ({ app, request }) => {
  await startChat(app);
  await composer(app).fill('コーヒーがおねがいします。');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  await theirs(app).first().getByRole('button', { name: 'Breakdown' }).click();
  await mine(app).first().getByRole('button', { name: 'Check' }).click();
  await expect(theirs(app).first().locator('.analysis-line')).toHaveCount(2);
  await expect(mine(app).first().locator('.verdict')).toBeVisible();
  const [chat] = await chatsOnDisk(request);
  expect(chat.messages[0].breakdown).toBeTruthy();
  expect(chat.messages[1].feedback).toBeTruthy();
});
