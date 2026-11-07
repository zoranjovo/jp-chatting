import { chatsOnDisk, composer, expect, mine, mockCalls, mockControl, startChat, test, theirs } from './fixtures.ts';

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
  // The sentence reads through: 何 and を glossed, the rest of the sentence after them unglossed.
  await expect(lines.nth(1).locator('.gloss:not(.gloss-plain)')).toHaveCount(2);
  await expect(lines.nth(1).locator('.gloss').first()).toContainText('what');
  await expect(lines.nth(1).locator('.gloss-line')).toHaveText(/何.*を.*飲みますか？/);
});

test('screen readers hear when a breakdown is being written and when it is ready', async ({ app, request }) => {
  await startChat(app);
  await mockControl(request, { delayMs: 800 });
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  const status = app.locator('.chat > [role="status"]');
  await expect(status).toHaveText('Thinking…');
  await expect(status).toHaveText('Breakdown ready.');
  // Hidden and shown again from the cache: nothing new to say.
  await message.getByRole('button', { name: 'Hide' }).click();
  await expect(status).toHaveText('', { timeout: 8000 });
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  await app.waitForTimeout(300);
  await expect(status).toHaveText('');
  // The only status region is the chat's: none per message.
  await expect(app.getByRole('status')).toHaveCount(1);
});

test('Breakdown is fetched once, then hidden and shown from the cache', async ({ app, request }) => {
  await startChat(app);
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);

  await message.getByRole('button', { name: 'Hide' }).click();
  await expect(message.locator('.analysis')).toBeHidden();
  await expect(message.locator('.analysis-wrap')).not.toHaveClass(/open/);
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
  await expect(message.locator('.fix-row-yours .line-jp')).toHaveText('コーヒーがおねがいします。');
  await expect(message.locator('.fix-row-yours .line-en')).toHaveText('Coffee does a request.');
  await expect(message.locator('.fix-row-fix .line-en')).toHaveText('A coffee, please.');
  await expect(message.locator('.line-fix')).toHaveCount(1);
});

test('furigana in the learner\'s feedback uses the panel\'s colour, not the dark bubble\'s', async ({ app }) => {
  await startChat(app);
  // Typed with furigana markup, so the learner's own bubble has a reading too.
  await composer(app).fill('コーヒーがお{願|ねが}いします。');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  const message = mine(app).first();
  await message.getByRole('button', { name: 'Check' }).click();
  const rt = message.locator('.fix-row-fix rt').first();
  await expect(rt).toHaveText('ねが');
  const colours = () =>
    Promise.all([
      rt.evaluate((el) => getComputedStyle(el).color),
      message.locator('.bubble rt').first().evaluate((el) => getComputedStyle(el).color),
      theirs(app).first().locator('rt').first().evaluate((el) => getComputedStyle(el).color),
    ]);

  // The panel uses --muted in each scheme, like the partner's bubble; the learner's dark bubble keeps its light ink.
  let [panelRt, bubbleRt, partnerRt] = await colours();
  expect(panelRt).toBe('rgb(111, 106, 98)');
  expect(partnerRt).toBe(panelRt);
  expect(bubbleRt).not.toBe(panelRt);

  await app.emulateMedia({ colorScheme: 'dark' });
  [panelRt, bubbleRt, partnerRt] = await colours();
  expect(panelRt).toBe('rgb(155, 149, 140)');
  expect(partnerRt).toBe(panelRt);
  expect(bubbleRt).not.toBe(panelRt);
});

// 願 is WaniKani level 13, above the tests' level (TEST_SETTINGS.wkLevel); 何 and 飲 in the opener are within it.
test('a correction keeps a kanji above the level, boxed as new, and its reading even with furigana off', async ({ app, request }) => {
  await request.put('/api/settings', { data: { furigana: false } });
  await app.reload();
  await startChat(app);
  await composer(app).fill('コーヒーがおねがいします。');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  await expect(theirs(app).first().locator('rt')).toHaveCount(0);
  const message = mine(app).first();
  await message.getByRole('button', { name: 'Check' }).click();
  await expect(message.locator('.fix-row-fix rt')).toHaveText('ねが');
  await expect(message.locator('.fix-row-fix .over-level')).toHaveText('願');
});

test('a kanji the learner has typed is known: never boxed in the chat, and no reading forced on it', async ({ app, request }) => {
  await request.put('/api/settings', { data: { furigana: false } });
  await app.reload();
  await startChat(app);
  await composer(app).fill('コーヒーがお願いします。');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  const message = mine(app).first();
  await message.getByRole('button', { name: 'Check' }).click();
  await expect(message.locator('.fix-row-fix .line-jp')).toHaveText('コーヒーをお願いします。');
  await expect(message.locator('.fix-row-fix rt')).toHaveCount(0);
  await expect(app.locator('.over-level')).toHaveCount(0);
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

test('opening and closing the panel never resizes the message bubble or its button', async ({ app }) => {
  await startChat(app);
  const message = theirs(app).first();
  const bubble = message.locator('.bubble');
  const button = message.locator('.bubble .tooltip-anchor button');
  const size = async () => [(await bubble.boundingBox())!.width, (await button.boundingBox())!.width];
  const before = await size();

  await button.click();
  await expect(message.locator('.analysis-wrap')).toHaveClass(/open/);
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  expect(await size()).toEqual(before);

  await button.click();
  await expect(message.locator('.analysis')).toBeHidden();
  expect(await size()).toEqual(before);
});

test('the panel spans the column while the bubble keeps to its text', async ({ app }) => {
  await startChat(app);
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  const bubble = (await message.locator('.bubble').boundingBox())!;
  const panel = (await message.locator('.analysis').boundingBox())!;
  expect(panel.width).toBeGreaterThan(bubble.width * 1.5);
});

test('a closed panel is inert, so its Redo button cannot be tabbed to', async ({ app }) => {
  await startChat(app);
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.getByRole('button', { name: 'Redo' })).toBeVisible();
  await message.getByRole('button', { name: 'Hide' }).click();
  await expect(message.getByRole('button', { name: 'Redo' })).toHaveCount(0);
});

test('on a wide screen each explanation sits right of its sentence, all on one column', async ({ app }) => {
  await startChat(app);
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  const lines = message.locator('.analysis-line');
  await expect(lines).toHaveCount(2);
  await expect(message.locator('.analysis-wrap')).toHaveClass(/open/);
  const lefts: number[] = [];
  for (let i = 0; i < 2; i++) {
    const main = (await lines.nth(i).locator('.line-main').boundingBox())!;
    const explain = (await lines.nth(i).locator('.line-explain').boundingBox())!;
    expect(explain.x).toBeGreaterThanOrEqual(main.x + main.width);
    expect(Math.abs(explain.y - main.y)).toBeLessThan(20);
    lefts.push(Math.round(explain.x));
  }
  expect(lefts[0]).toBe(lefts[1]);
});

test('Redo from the keyboard keeps focus on it while the new analysis is written', async ({ app, request }) => {
  await startChat(app);
  const message = theirs(app).first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  await mockControl(request, { delayMs: 800 });
  const redo = message.getByRole('button', { name: 'Redo' });
  await redo.focus();
  await app.keyboard.press('Enter');
  await expect(message.locator('.analysis-busy')).toBeVisible();
  await expect(redo).toBeFocused();
  await expect(redo).toHaveAttribute('aria-disabled', 'true');
  await expect(message.locator('.analysis-line')).toHaveCount(2);
  await expect(redo).toBeFocused();
});
