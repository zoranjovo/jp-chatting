import { chatsOnDisk, expect, startChat, test } from './fixtures.ts';

test('a chat can be renamed', async ({ app, request }) => {
  await startChat(app, 'Old name');
  app.once('dialog', (d) => d.accept('New name'));
  await app.locator('.chat-item.active').getByRole('button', { name: 'Rename chat' }).click();
  await expect(app.locator('.chat-item.active .chat-title')).toHaveText('New name');
  await expect(app.locator('.topbar h1')).toHaveText('New name');
  expect((await chatsOnDisk(request))[0].title).toBe('New name');
});

test('cancelling a rename changes nothing', async ({ app }) => {
  await startChat(app, 'Keep me');
  app.once('dialog', (d) => d.dismiss());
  await app.locator('.chat-item.active').getByRole('button', { name: 'Rename chat' }).click();
  await expect(app.locator('.chat-item.active .chat-title')).toHaveText('Keep me');
});

test('a chat can be deleted after confirming', async ({ app, request }) => {
  await startChat(app, 'Doomed');
  app.once('dialog', (d) => d.accept());
  await app.locator('.chat-item.active').getByRole('button', { name: 'Delete chat' }).click();
  await expect(app.locator('.chat-item')).toHaveCount(0);
  await expect(app.getByRole('heading', { name: 'Practise Japanese by chatting' })).toBeVisible();
  expect(await chatsOnDisk(request)).toHaveLength(0);
});

test('declining the confirmation keeps the chat', async ({ app, request }) => {
  await startChat(app, 'Safe');
  app.once('dialog', (d) => d.dismiss());
  await app.locator('.chat-item.active').getByRole('button', { name: 'Delete chat' }).click();
  await expect(app.locator('.chat-item')).toHaveCount(1);
  expect(await chatsOnDisk(request)).toHaveLength(1);
});

test('deleting a chat that is not open leaves the open one alone', async ({ app }) => {
  await startChat(app, 'Background');
  await startChat(app, 'Foreground');
  app.once('dialog', (d) => d.accept());
  const other = app.locator('.chat-item', { hasText: 'Background' });
  await other.hover();
  await other.getByRole('button', { name: 'Delete chat' }).click();
  await expect(app.locator('.chat-item')).toHaveCount(1);
  await expect(app.locator('.topbar h1')).toHaveText('Foreground');
});
