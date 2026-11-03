import type { Page } from '@playwright/test';
import { chatsOnDisk, expect, startChat, test } from './fixtures.ts';

const dialog = (app: Page) => app.locator('dialog[open]');

/** A click on the darkened backdrop, outside the dialog box. */
async function clickBackdrop(app: Page) {
  await app.mouse.click(5, 5);
}

test('a chat can be renamed', async ({ app, request }) => {
  await startChat(app, 'Old name');
  await app.locator('.chat-item.active').getByRole('button', { name: 'Rename chat' }).click();
  await expect(dialog(app).getByRole('heading')).toHaveText('Rename chat');
  await expect(dialog(app).getByLabel('Title')).toHaveValue('Old name');
  await dialog(app).getByLabel('Title').fill('New name');
  await dialog(app).getByLabel('Title').press('Enter');
  await expect(dialog(app)).toHaveCount(0);
  await expect(app.locator('.chat-item.active .chat-title')).toHaveText('New name');
  await expect(app.locator('.topbar h1')).toHaveText('New name');
  expect((await chatsOnDisk(request))[0].title).toBe('New name');
});

test('a rename can be cancelled with the button, Escape or a click on the backdrop', async ({ app, request }) => {
  await startChat(app, 'Keep me');
  const rename = app.locator('.chat-item.active').getByRole('button', { name: 'Rename chat' });
  for (const cancel of [
    () => dialog(app).getByRole('button', { name: 'Cancel' }).click(),
    () => app.keyboard.press('Escape'),
    () => clickBackdrop(app),
  ]) {
    await rename.click();
    await dialog(app).getByLabel('Title').fill('Changed');
    await cancel();
    await expect(dialog(app)).toHaveCount(0);
    await expect(app.locator('.chat-item.active .chat-title')).toHaveText('Keep me');
  }
  expect((await chatsOnDisk(request))[0].title).toBe('Keep me');
});

test('a chat cannot be renamed to nothing', async ({ app }) => {
  await startChat(app, 'Named');
  await app.locator('.chat-item.active').getByRole('button', { name: 'Rename chat' }).click();
  await dialog(app).getByLabel('Title').fill('   ');
  await expect(dialog(app).getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('a chat can be deleted after confirming', async ({ app, request }) => {
  await startChat(app, 'Doomed');
  await app.locator('.chat-item.active').getByRole('button', { name: 'Delete chat' }).click();
  await expect(dialog(app)).toContainText('Delete “Doomed”? This cannot be undone.');
  await dialog(app).getByRole('button', { name: 'Delete' }).click();
  await expect(app.locator('.chat-item')).toHaveCount(0);
  await expect(app.getByRole('heading', { name: 'Practise Japanese by chatting' })).toBeVisible();
  expect(await chatsOnDisk(request)).toHaveLength(0);
});

test('declining the confirmation keeps the chat, whether by Cancel, Escape or the backdrop', async ({ app, request }) => {
  await startChat(app, 'Safe');
  const remove = app.locator('.chat-item.active').getByRole('button', { name: 'Delete chat' });
  for (const cancel of [
    () => dialog(app).getByRole('button', { name: 'Cancel' }).click(),
    () => app.keyboard.press('Escape'),
    () => clickBackdrop(app),
  ]) {
    await remove.click();
    await expect(dialog(app)).toBeVisible();
    await cancel();
    await expect(dialog(app)).toHaveCount(0);
  }
  await expect(app.locator('.chat-item')).toHaveCount(1);
  expect(await chatsOnDisk(request)).toHaveLength(1);
});

test('deleting a chat that is not open leaves the open one alone', async ({ app }) => {
  await startChat(app, 'Background');
  await startChat(app, 'Foreground');
  const other = app.locator('.chat-item', { hasText: 'Background' });
  await other.hover();
  await other.getByRole('button', { name: 'Delete chat' }).click();
  await dialog(app).getByRole('button', { name: 'Delete' }).click();
  await expect(app.locator('.chat-item')).toHaveCount(1);
  await expect(app.locator('.topbar h1')).toHaveText('Foreground');
});
