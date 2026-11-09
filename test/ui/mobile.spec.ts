import { devices } from '@playwright/test';
import { composer, expect, expectTooltipBeside, mine, startChat, test, theirs } from './fixtures.ts';

test.use({ viewport: devices['Pixel 7'].viewport, hasTouch: true });

test('the sidebar is hidden behind the menu on a phone', async ({ app }) => {
  await startChat(app, 'Phone chat');
  const sidebar = app.locator('.sidebar');
  await expect(sidebar).not.toBeInViewport();
  await app.getByRole('button', { name: 'Menu' }).click();
  await expect(sidebar).toBeInViewport();
  await app.locator('.chat-item', { hasText: 'Phone chat' }).locator('.chat-item-main').click();
  await expect(sidebar).not.toBeInViewport();
});

test('a new chat can be started from the top bar without opening the menu', async ({ app }) => {
  await startChat(app, 'First');
  await app.locator('.topbar').getByRole('button', { name: 'New chat' }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Start' }).click();
  await expect(app.locator('.chat-item')).toHaveCount(2);
  await expect(app.locator('.sidebar')).not.toBeInViewport();
});

test('a phone on its side gets the menu too, so the chat has the whole width', async ({ app }) => {
  await app.setViewportSize({ width: 844, height: 390 });
  await startChat(app, 'Sideways');
  await expect(app.locator('.sidebar')).not.toBeInViewport();
  await expect(app.getByRole('button', { name: 'Menu' })).toBeVisible();
});

test('Settings opened from the menu closes the menu, and focus comes back to the menu button', async ({ app }) => {
  const menu = app.getByRole('button', { name: 'Menu' });
  await menu.click();
  await app.locator('.sidebar').getByRole('button', { name: 'Settings' }).click();
  await expect(app.getByRole('dialog')).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await app.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.locator('.sidebar')).not.toBeInViewport();
  await expect(menu).toBeFocused();
});

test('the composer placeholder fits on one line on a phone', async ({ app }) => {
  await startChat(app);
  // Romaji input is on by default.
  await expect(composer(app)).toHaveAttribute('placeholder', 'Type romaji…');
  const { height, line } = await composer(app).evaluate((el) => ({ height: el.scrollHeight, line: parseFloat(getComputedStyle(el).lineHeight) }));
  expect(height).toBeLessThan(line * 2);
});

test('tapping outside closes the menu', async ({ app }) => {
  await app.getByRole('button', { name: 'Menu' }).click();
  await expect(app.locator('.sidebar')).toBeInViewport();
  await app.locator('.scrim').click({ position: { x: 380, y: 400 } });
  await expect(app.locator('.sidebar')).not.toBeInViewport();
});

test('Back closes the menu instead of leaving the app', async ({ app }) => {
  await startChat(app, 'Phone chat');
  await app.getByRole('button', { name: 'Menu' }).click();
  await expect(app.locator('.sidebar')).toBeInViewport();
  await app.goBack();
  await expect(app.locator('.sidebar')).not.toBeInViewport();
  await expect(app.locator('h1')).toHaveText('Phone chat');
});

test('picking a chat from the menu, then Back, returns to the chat before', async ({ app }) => {
  await startChat(app, 'One');
  await startChat(app, 'Two');
  await app.getByRole('button', { name: 'Menu' }).click();
  await app.locator('.chat-item', { hasText: 'One' }).locator('.chat-item-main').click();
  await expect(app.locator('h1')).toHaveText('One');
  await app.goBack();
  await expect(app.locator('h1')).toHaveText('Two');
  await expect(app.locator('.sidebar')).not.toBeInViewport();
});

test('the closed menu is out of the tab order, and the open one is all there is', async ({ app }) => {
  await startChat(app, 'Phone chat');
  const sidebar = app.locator('.sidebar');
  const menu = app.getByRole('button', { name: 'Menu' });
  await expect(sidebar).toHaveAttribute('inert', '');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  await menu.focus();
  await app.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar).not.toHaveAttribute('inert');
  await expect(app.locator('.main')).toHaveAttribute('inert', '');
  await expect(sidebar.getByRole('button', { name: '+ New chat' })).toBeFocused();
  // Round and round the drawer: every stop is inside it (or the browser's own controls, between laps).
  let inside = 0;
  for (let i = 0; i < 16; i += 1) {
    await app.keyboard.press('Tab');
    const where = await app.evaluate(() => (document.activeElement?.closest('.sidebar') ? 'sidebar' : document.activeElement === document.body ? 'body' : 'other'));
    expect(where).not.toBe('other');
    if (where === 'sidebar') inside += 1;
  }
  expect(inside).toBeGreaterThanOrEqual(12);
});

test('Escape in a Rename dialog opened from the menu closes only the dialog', async ({ app }) => {
  await startChat(app, 'Phone chat');
  await app.getByRole('button', { name: 'Menu' }).click();
  const rename = app.locator('.chat-item.active').getByRole('button', { name: 'Rename chat' });
  await rename.click();
  await expect(app.getByRole('dialog')).toBeVisible();
  await app.keyboard.press('Escape');
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.locator('.sidebar')).toBeInViewport();
  await expect(rename).toBeFocused();
});

test('a dialog from the menu still works if the menu is hidden under it', async ({ app }) => {
  await app.setViewportSize({ width: 1000, height: 800 });
  await startChat(app, 'Old name');
  await app.locator('.chat-item.active').getByRole('button', { name: 'Rename chat' }).click();
  // Narrowed with the dialog open (a window snapped to half the screen): the sidebar goes inert, its dialog mustn't.
  await app.setViewportSize({ width: 600, height: 800 });
  await expect(app.locator('.sidebar')).toHaveAttribute('inert', '');
  await app.getByRole('dialog').getByRole('textbox').fill('New name');
  await app.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.locator('h1')).toHaveText('New name');
});

test('widening the window closes the menu, so narrowing it again does not reopen it', async ({ app }) => {
  await startChat(app, 'Phone chat');
  const menu = app.getByRole('button', { name: 'Menu' });
  await menu.click();
  await expect(app.locator('.sidebar')).toBeInViewport();
  await app.setViewportSize({ width: 1000, height: 800 });
  await expect(app.locator('.sidebar')).not.toHaveAttribute('inert');
  await expect(app.locator('.main')).not.toHaveAttribute('inert');
  await composer(app).focus();
  await app.setViewportSize({ width: 375, height: 812 });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(app.locator('.sidebar')).toHaveAttribute('inert', '');
  await expect(composer(app)).toBeFocused();
});

test('Escape closes the menu and puts focus back on the menu button', async ({ app }) => {
  await startChat(app, 'Phone chat');
  const menu = app.getByRole('button', { name: 'Menu' });
  await menu.focus();
  await app.keyboard.press('Enter');
  await expect(app.locator('.sidebar')).toBeInViewport();
  await app.keyboard.press('Escape');
  await expect(app.locator('.sidebar')).not.toBeInViewport();
  await expect(menu).toBeFocused();
});

test('picking a chat from the menu with the keyboard leaves focus on the menu button, not the page', async ({ app }) => {
  await startChat(app, 'One');
  await startChat(app, 'Two');
  const menu = app.getByRole('button', { name: 'Menu' });
  await menu.focus();
  await app.keyboard.press('Enter');
  await app.locator('.chat-item', { hasText: 'One' }).locator('.chat-item-main').focus();
  await app.keyboard.press('Enter');
  await expect(app.locator('h1')).toHaveText('One');
  await expect(menu).toBeFocused();
});

test('the page never scrolls sideways and the composer fits', async ({ app }) => {
  await startChat(app);
  await composer(app).fill('ながいメッセージ'.repeat(20));
  const overflow = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(app.getByRole('button', { name: 'Send' })).toBeInViewport();
});

test('on a phone each explanation sits under its sentence', async ({ app }) => {
  await startChat(app);
  const message = app.locator('.message.theirs').first();
  await message.getByRole('button', { name: 'Breakdown' }).click();
  const line = message.locator('.analysis-line').nth(1);
  await expect(line.locator('.line-explain')).toBeVisible();
  const main = (await line.locator('.line-main').boundingBox())!;
  const explain = (await line.locator('.line-explain').boundingBox())!;
  expect(explain.y).toBeGreaterThanOrEqual(main.y + main.height - 1);
  const overflow = await app.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('on a phone, the action tooltips leave the message text uncovered too', async ({ app }) => {
  await startChat(app);
  await composer(app).fill('コーヒーをください');
  await app.getByRole('button', { name: 'Send' }).click();
  await expect(theirs(app)).toHaveCount(2);
  // Tab, not focus(): the tooltips open on focus only when it is visible, as after a key.
  for (const [message, before, name] of [
    [mine(app).first(), 'Rewind', 'Check'],
    [theirs(app).first(), 'How this message was written', 'Breakdown'],
  ] as const) {
    await message.getByRole('button', { name: before }).focus();
    await app.keyboard.press('Tab');
    await expectTooltipBeside(app, message.getByRole('button', { name }), message.locator('.bubble-text'));
  }
});

for (const [width, height, topbar] of [
  [360, 330, true],
  [667, 200, false],
] as const) {
  test(`with the keyboard up at ${width}×${height}, a rewind and a long draft leave the composer whole and the chat in view`, async ({ app }) => {
    await startChat(app);
    await composer(app).fill('コーヒーがおねがいします。');
    await app.getByRole('button', { name: 'Send' }).click();
    await expect(theirs(app)).toHaveCount(2);
    await mine(app).first().getByRole('button', { name: 'Check' }).click();
    await expect(mine(app).first().locator('.verdict')).toBeVisible();
    await mine(app).first().getByRole('button', { name: /Rewind/ }).click();
    await expect(app.locator('.pinned')).toBeVisible();
    await expect(app.locator('.undo-toast')).toBeVisible();
    await composer(app).fill(['えきはどこですか', '', 'すみません', 'このちかくにえきはありますか', 'とおいですか', 'ありがとう'].join('\n'));
    // The keyboard coming up, as a browser that resizes the page for it (#viewport) does.
    await app.setViewportSize({ width, height });

    const overflow = await app.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(app.getByRole('button', { name: 'Send' })).toBeInViewport({ ratio: 1 });
    await expect(app.getByRole('button', { name: 'Undo' })).toBeInViewport({ ratio: 1 });
    const box = (await app.locator('.composer').boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect((await app.locator('.messages').boundingBox())!.height).toBeGreaterThanOrEqual(40);
    if (topbar) await expect(app.locator('.topbar')).toBeVisible();
    else await expect(app.locator('.topbar')).toBeHidden();
  });
}

test.describe('on a touch screen', () => {
  test.use({ isMobile: true });

  test('every control is at least 44px each way, the message actions included', async ({ app }) => {
    expect(await app.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await startChat(app, 'Phone chat');
    await composer(app).fill('はい');
    await app.getByRole('button', { name: 'Send' }).tap();
    await expect(theirs(app)).toHaveCount(2);
    await app.getByRole('button', { name: 'Menu' }).click();
    await expect(app.locator('.sidebar')).toBeInViewport();

    const small: string[] = [];
    const targets = app.locator('.bubble-actions button, .chat-item-actions button, .menu-button, .topbar-new, .romaji-toggle, .send');
    for (const button of await targets.all()) {
      const box = await button.boundingBox();
      if (box && (box.width < 44 || box.height < 44)) small.push(`${await button.getAttribute('class')} ${box.width}x${box.height}`);
    }
    expect(small).toEqual([]);
    expect(await targets.count()).toBeGreaterThan(8);
  });

  test('Enter on a touch keyboard starts a new line, and Send sends the lines as one message', async ({ app }) => {
    await startChat(app);
    await expect(composer(app)).toHaveAttribute('enterkeyhint', 'enter');
    await composer(app).fill('はい');
    await composer(app).press('Enter');
    await composer(app).pressSequentially('arigatou');
    await expect(composer(app)).toHaveValue('はい\nありがとう');
    await expect(mine(app)).toHaveCount(0);
    await app.getByRole('button', { name: 'Send' }).tap();
    await expect(mine(app)).toHaveCount(1);
    // The box keeps focus, so the keyboard stays up for the next message.
    await expect(composer(app)).toBeFocused();
    expect(await mine(app).locator('.bubble-text').evaluate((el) => el.textContent)).toBe('はい\nありがとう');
    await expect(theirs(app)).toHaveCount(2);
  });

  test('a tap on Send with the box unfocused leaves it unfocused, so no keyboard pops up over the reply', async ({ app }) => {
    await startChat(app);
    await composer(app).fill('はい');
    await composer(app).blur();
    await app.getByRole('button', { name: 'Send' }).tap();
    await expect(mine(app)).toHaveCount(1);
    await expect(composer(app)).not.toBeFocused();
  });

  test('on a wide touch screen the romaji placeholder keeps its katakana hint', async ({ app }) => {
    await app.setViewportSize({ width: 1024, height: 768 });
    await startChat(app);
    await expect(composer(app)).toHaveAttribute('placeholder', /CAPS for katakana/);
    await composer(app).evaluate((el) => el.closest('.composer')?.querySelector<HTMLButtonElement>('.romaji-toggle')?.click());
    await expect(composer(app)).toHaveAttribute('placeholder', 'Write in Japanese…');
  });

  test('tapping a kanji shows its meaning, level and why it is marked; a tap elsewhere closes it', async ({ app, request }) => {
    await request.put('/api/settings', { data: { wkLevel: 1 } });
    await app.reload();
    await startChat(app);
    // The reply itself spells out a kanji above the level; the breakdown keeps it, marked.
    await theirs(app).first().getByRole('button', { name: 'Breakdown' }).tap();
    const text = theirs(app).first().locator('.analysis');
    const drink = text.locator('.kanji', { hasText: '飲' }).first();
    await expect(drink).toHaveClass(/over-level/);
    await drink.tap();
    const pop = app.locator('.kanji-pop');
    await expect(pop).toBeVisible();
    await expect(pop).toContainText('Above WaniKani level 1, the level this was written at');
    await expect(pop).toContainText(/drink/i);
    await expect(pop).toContainText(/WaniKani level \d+/);

    await text.locator('.kanji', { hasText: '何' }).first().tap();
    await expect(pop).toHaveCount(1);
    await expect(pop).toContainText(/what/i);

    // A press that starts a scroll (no click follows) leaves it open, to read the sentence under it.
    await app.locator('.messages').dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true });
    await app.locator('.messages').evaluate((list) => list.scrollBy(0, 20));
    await expect(pop).toHaveCount(1);
    await app.locator('.messages').tap({ position: { x: 10, y: 10 } });
    await expect(pop).toHaveCount(0);
  });

  test('a hardware keyboard on a tablet still sends with Ctrl+Enter', async ({ app }) => {
    await startChat(app);
    await composer(app).fill('はい');
    await composer(app).press('Control+Enter');
    await expect(mine(app)).toHaveCount(1);
    await expect(composer(app)).toHaveValue('');
  });

  test('a dialog opens without focusing a text field, so the keyboard stays down until a field is tapped', async ({ app }) => {
    await app.locator('.topbar').getByRole('button', { name: 'New chat' }).click();
    const dialog = app.getByRole('dialog');
    await expect(dialog).toBeFocused();
    await dialog.getByRole('textbox').tap();
    await expect(dialog.getByRole('textbox')).toBeFocused();
  });
});
