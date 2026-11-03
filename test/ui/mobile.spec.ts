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
  for (let i = 0; i < 8; i += 1) {
    await app.keyboard.press('Tab');
    expect(await app.evaluate(() => !!document.activeElement?.closest('.main'))).toBe(false);
  }
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
