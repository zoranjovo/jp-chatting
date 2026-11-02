import { devices } from '@playwright/test';
import { composer, expect, startChat, test } from './fixtures.ts';

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
