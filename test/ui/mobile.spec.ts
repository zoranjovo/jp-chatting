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

test.describe('on a touch screen', () => {
  test.use({ isMobile: true });

  test('every control is at least 44px each way, the message actions included', async ({ app }) => {
    expect(await app.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await startChat(app, 'Phone chat');
    await composer(app).fill('はい');
    await composer(app).press('Enter');
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

  test('a dialog opens without focusing a text field, so the keyboard stays down until a field is tapped', async ({ app }) => {
    await app.locator('.topbar').getByRole('button', { name: 'New chat' }).click();
    const dialog = app.getByRole('dialog');
    await expect(dialog).toBeFocused();
    await dialog.getByRole('textbox').tap();
    await expect(dialog.getByRole('textbox')).toBeFocused();
  });
});
