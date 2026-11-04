import type { Page } from '@playwright/test';
import { chatsOnDisk, composer, expect, mine, startChat, test, theirs } from './fixtures.ts';

const dialog = (app: Page) => app.locator('dialog[open]');

/** A click on the darkened backdrop, outside the dialog box. */
async function clickBackdrop(app: Page) {
  await app.mouse.click(5, 5);
}

test('each chat has its own URL: Back and Forward move between chats, and a reload stays in the chat', async ({ app }) => {
  await startChat(app, 'First');
  await startChat(app, 'Second');
  const first = app.locator('.chat-item', { hasText: 'First' }).locator('.chat-item-main');
  await first.click();
  await expect(app.locator('h1')).toHaveText('First');
  const firstUrl = app.url();
  expect(firstUrl).toMatch(/#[0-9a-f-]{36}$/);

  await app.reload();
  await expect(app.locator('h1')).toHaveText('First');
  expect(app.url()).toBe(firstUrl);

  await app.goBack();
  await expect(app.locator('h1')).toHaveText('Second');
  await app.goForward();
  await expect(app.locator('h1')).toHaveText('First');
});

test('Back closes an open dialog and stays in the app', async ({ app }) => {
  await startChat(app, 'First');
  await startChat(app, 'Second');
  await app.locator('.topbar').getByRole('button', { name: 'Chat settings' }).click();
  await expect(app.getByRole('dialog')).toBeVisible();
  await app.goBack();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.locator('h1')).toHaveText('Second');

  // Closed with Cancel instead, the dialog leaves no extra step behind: Back goes to the previous chat.
  await app.locator('.topbar').getByRole('button', { name: 'Chat settings' }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await app.goBack();
  await expect(app.locator('h1')).toHaveText('First');
});

test('Back closes the rename dialog too, keeping the old name', async ({ app }) => {
  await startChat(app, 'Keep me');
  await app.locator('.chat-item.active').getByRole('button', { name: 'Rename chat' }).click();
  await app.getByRole('dialog').getByRole('textbox').fill('Changed');
  await app.goBack();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.locator('.chat-item.active .chat-title')).toHaveText('Keep me');
});

test('deleting the open chat takes its id out of the URL', async ({ app }) => {
  await startChat(app, 'Doomed');
  await app.locator('.chat-item.active').getByRole('button', { name: 'Delete chat' }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(app.locator('.chat-item')).toHaveCount(0);
  expect(new URL(app.url()).hash).toBe('');
});

test('after deleting a chat, focus moves to the chat that took its place, or to New chat', async ({ app }) => {
  await startChat(app, 'Keep');
  await startChat(app, 'Delete me');
  await app.locator('.chat-item', { hasText: 'Delete me' }).getByRole('button', { name: 'Delete chat' }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Delete' }).press('Enter');
  await expect(app.locator('.chat-item')).toHaveCount(1);
  await expect(app.locator('.chat-item', { hasText: 'Keep' }).locator('.chat-item-main')).toBeFocused();

  await app.locator('.chat-item', { hasText: 'Keep' }).getByRole('button', { name: 'Delete chat' }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Delete' }).press('Enter');
  await expect(app.locator('.chat-item')).toHaveCount(0);
  await expect(app.locator('.sidebar .new-chat')).toBeFocused();
});

test('a failed delete leaves no focus move pending to fire later', async ({ app }) => {
  await startChat(app, 'Stays');
  await app.route('**/api/chats/*', (route) => (route.request().method() === 'DELETE' ? route.abort() : route.continue()));
  await app.locator('.chat-item.active').getByRole('button', { name: 'Delete chat' }).click();
  const failed = app.waitForEvent('requestfailed', (r) => r.method() === 'DELETE');
  await app.getByRole('dialog').getByRole('button', { name: 'Delete' }).press('Enter');
  await failed;
  await app.unroute('**/api/chats/*');
  await expect(app.locator('.chat-item')).toHaveCount(1);
  await composer(app).click();
  await composer(app).fill('もしもし');
  await composer(app).press('Enter');
  await expect(theirs(app)).toHaveCount(2);
  await expect(composer(app)).toBeFocused();
});

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

test('Back to a chat that was deleted stays on the chat shown, which keeps working', async ({ app }) => {
  await startChat(app, 'Gone');
  await startChat(app, 'Here');
  const here = app.url();
  const gone = app.locator('.chat-item', { hasText: 'Gone' });
  await gone.hover();
  await gone.getByRole('button', { name: 'Delete chat' }).click();
  await app.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(app.locator('.chat-item')).toHaveCount(1);
  await app.goBack();
  await expect(app.locator('h1')).toHaveText('Here');
  await expect.poll(() => app.url()).toBe(here);
  await composer(app).fill('まだ いますか');
  await composer(app).press('Enter');
  await expect(mine(app)).toHaveCount(1);
  await expect(theirs(app)).toHaveCount(2);
});

test('a chat started from the dialog gets its own entry, after the dialog\'s is gone', async ({ app }) => {
  await startChat(app, 'First');
  const first = app.url();
  await startChat(app, 'Second');
  await expect.poll(() => app.url()).not.toBe(first);
  await app.goBack();
  await expect(app.locator('h1')).toHaveText('First');
  expect(app.url()).toBe(first);
});

test('Forward onto a closed dialog\'s entry opens nothing, and Back still goes to the chat before', async ({ app }) => {
  await startChat(app, 'First');
  await startChat(app, 'Second');
  await app.locator('.topbar').getByRole('button', { name: 'Chat settings' }).click();
  await expect(app.getByRole('dialog')).toBeVisible();
  await app.goBack();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await app.goForward();
  await expect(app.getByRole('dialog')).toHaveCount(0);
  await expect(app.locator('h1')).toHaveText('Second');
  await app.goBack();
  await expect(app.locator('h1')).toHaveText('First');
});
