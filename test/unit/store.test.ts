import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import * as store from '../../server/store.ts';
import { DEFAULT_SETTINGS, type Chat } from '../../shared/types.ts';
import { clearTempData, useTempData } from './helpers.ts';

let dir: string;
before(async () => {
  dir = await useTempData();
});
after(clearTempData);

const chat = (id: string, updatedAt: string): Chat => ({ id, title: id, topic: '', politeness: 'polite', createdAt: updatedAt, updatedAt, messages: [] });

describe('settings', () => {
  test('defaults when nothing is saved', async () => {
    assert.deepEqual(await store.getSettings(), DEFAULT_SETTINGS);
  });

  test('a patch merges into what is saved, nested sections included', async () => {
    await store.saveSettings({ wkLevel: 12, endpoint: { ...DEFAULT_SETTINGS.endpoint, model: 'qwen' } });
    const saved = await store.saveSettings({ claude: { ...DEFAULT_SETTINGS.claude, model: 'claude-opus-5-5' } } as never);
    assert.equal(saved.wkLevel, 12);
    assert.equal(saved.endpoint.model, 'qwen');
    assert.equal(saved.claude.model, 'claude-opus-5-5');
    assert.deepEqual(await store.getSettings(), saved);
  });

  test('a partial nested patch keeps the other nested fields', async () => {
    const saved = await store.saveSettings({ endpoint: { apiKey: 'k' } } as never);
    assert.equal(saved.endpoint.apiKey, 'k');
    assert.equal(saved.endpoint.model, 'qwen');
    assert.equal(saved.endpoint.baseUrl, DEFAULT_SETTINGS.endpoint.baseUrl);
  });

  test('the WaniKani level is clamped to 0-60 and rounded', async () => {
    assert.equal((await store.saveSettings({ wkLevel: 99 })).wkLevel, 60);
    assert.equal((await store.saveSettings({ wkLevel: -4 })).wkLevel, 0);
    assert.equal((await store.saveSettings({ wkLevel: 7.6 })).wkLevel, 8);
    assert.equal((await store.saveSettings({ wkLevel: 'abc' as never })).wkLevel, 0);
  });

  test('a settings file from an older version gains the new fields', async () => {
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ wkLevel: 3, claude: { model: 'claude-haiku-5-5' } }));
    const s = await store.getSettings();
    assert.equal(s.wkLevel, 3);
    assert.equal(s.claude.model, 'claude-haiku-5-5');
    assert.equal(s.claude.command, DEFAULT_SETTINGS.claude.command);
    assert.equal(s.furigana, DEFAULT_SETTINGS.furigana);
  });

  test('saves made at the same moment all stick, with no temp files left behind', async () => {
    await Promise.all([
      store.saveSettings({ furigana: false }),
      store.saveSettings({ genkiLesson: 7 }),
      store.saveSettings({ uiLanguage: 'ja' }),
      store.saveSettings({ romajiInput: false }),
    ]);
    const s = await store.getSettings();
    assert.deepEqual([s.furigana, s.genkiLesson, s.uiLanguage, s.romajiInput], [false, 7, 'ja', false]);
    const files = await fs.readdir(dir);
    assert.ok(!files.some((f) => f.endsWith('.tmp')), files.join());
    JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf8'));
  });

  test('a failed save leaves the previous settings in place', async () => {
    const before = await store.getSettings();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await assert.rejects(store.saveSettings({ claude: circular as never }), /circular/i);
    assert.deepEqual(await store.getSettings(), before);
    await store.saveSettings({ furigana: true });
  });
});

describe('chats', () => {
  test('an empty store lists nothing', async () => {
    assert.deepEqual(await store.listChats(), []);
  });

  test('saves, reads back and lists newest first without messages', async () => {
    await store.saveChat(chat('a', '2026-01-01T00:00:00.000Z'));
    await store.saveChat({ ...chat('b', '2026-03-01T00:00:00.000Z'), messages: [{ id: 'm', role: 'user', content: 'x', createdAt: '' }] });
    await store.saveChat(chat('c', '2026-02-01T00:00:00.000Z'));
    const list = await store.listChats();
    assert.deepEqual(list.map((c) => c.id), ['b', 'c', 'a']);
    assert.ok(!('messages' in list[0]));
    assert.equal((await store.getChat('b'))!.messages.length, 1);
  });

  test('one file per chat under data/chats', async () => {
    const files = await fs.readdir(path.join(dir, 'chats'));
    assert.deepEqual(files.sort(), ['a.json', 'b.json', 'c.json']);
  });

  test('a missing chat is null, and deleting it is harmless', async () => {
    assert.equal(await store.getChat('nope'), null);
    await store.deleteChat('nope');
  });

  test('deletes a chat', async () => {
    await store.deleteChat('a');
    assert.equal(await store.getChat('a'), null);
    assert.deepEqual((await store.listChats()).map((c) => c.id), ['b', 'c']);
  });

  test('skips stray files in the chats folder', async () => {
    await fs.writeFile(path.join(dir, 'chats', 'notes.txt'), 'hi');
    assert.equal((await store.listChats()).length, 2);
  });

  test('refuses ids that could escape the folder', async () => {
    assert.equal(store.isChatId('../settings'), false);
    assert.equal(store.isChatId('a/b'), false);
    assert.equal(store.isChatId(''), false);
    assert.equal(store.isChatId(store.newId()), true);
    await assert.rejects(store.getChat('../settings'), /bad chat id/);
  });

  test('newId is unique and now is an ISO timestamp', () => {
    assert.notEqual(store.newId(), store.newId());
    assert.ok(!Number.isNaN(Date.parse(store.now())));
  });
});

describe('settings migration', () => {
  test('old Claude model aliases are pinned to their 5.5 ids', async () => {
    for (const [alias, id] of [['haiku', 'claude-haiku-5-5'], ['sonnet', 'claude-sonnet-5-5'], ['opus', 'claude-opus-5-5']]) {
      await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ claude: { model: alias } }));
      assert.equal((await store.getSettings()).claude.model, id, alias);
    }
  });

  test('a full model id is kept as is', async () => {
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ claude: { model: 'claude-opus-5-5' } }));
    assert.equal((await store.getSettings()).claude.model, 'claude-opus-5-5');
  });
});

describe('Genki lesson', () => {
  test('defaults to 0 (not using Genki) and is clamped to 0-23', async () => {
    assert.equal(DEFAULT_SETTINGS.genkiLesson, 0);
    assert.equal((await store.saveSettings({ genkiLesson: 40 })).genkiLesson, 23);
    assert.equal((await store.saveSettings({ genkiLesson: -2 })).genkiLesson, 0);
    assert.equal((await store.saveSettings({ genkiLesson: 12 })).genkiLesson, 12);
  });
});

describe('migrating speech style from settings to chats', () => {
  test('old chats get the old setting, the setting is dropped, and new chats are untouched', async () => {
    await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ wkLevel: 9, politeness: 'casual' }));
    const { politeness: _old, ...legacyChat } = chat('legacy', '2026-01-05T00:00:00.000Z');
    await fs.writeFile(path.join(dir, 'chats', 'legacy.json'), JSON.stringify(legacyChat));
    await store.saveChat({ ...chat('modern', '2026-01-06T00:00:00.000Z'), politeness: 'polite' });

    await store.migrateLegacy();

    assert.equal((await store.getChat('legacy'))!.politeness, 'casual');
    assert.equal((await store.getChat('modern'))!.politeness, 'polite');
    const raw = JSON.parse(await fs.readFile(path.join(dir, 'settings.json'), 'utf8'));
    assert.ok(!('politeness' in raw));
    assert.equal(raw.wkLevel, 9, 'other settings are kept');
  });

  test('without an old setting, old chats become polite; running again changes nothing', async () => {
    const { politeness: _old, ...legacyChat } = chat('legacy2', '2026-01-07T00:00:00.000Z');
    await fs.writeFile(path.join(dir, 'chats', 'legacy2.json'), JSON.stringify(legacyChat));
    await store.migrateLegacy();
    assert.equal((await store.getChat('legacy2'))!.politeness, 'polite');
    const before = await fs.readFile(path.join(dir, 'chats', 'legacy.json'), 'utf8');
    await store.migrateLegacy();
    assert.equal(await fs.readFile(path.join(dir, 'chats', 'legacy.json'), 'utf8'), before);
  });
});

describe('JLPT level setting', () => {
  test('defaults to not set, keeps 1-5 and drops anything else', async () => {
    assert.equal(DEFAULT_SETTINGS.jlptLevel, 0);
    assert.equal((await store.saveSettings({ jlptLevel: 3 })).jlptLevel, 3);
    assert.equal((await store.saveSettings({ jlptLevel: 9 as never })).jlptLevel, 0);
  });
});

describe('endpoint thinking', () => {
  test('defaults to the model default, keeps a known level and drops anything else', async () => {
    assert.equal(DEFAULT_SETTINGS.endpoint.reasoning, '');
    assert.equal((await store.saveSettings({ endpoint: { reasoning: 'none' } as never })).endpoint.reasoning, 'none');
    assert.equal((await store.saveSettings({ endpoint: { reasoning: 'max' } as never })).endpoint.reasoning, '');
    const kept = await store.saveSettings({ endpoint: { reasoning: 'low' } as never });
    assert.equal(kept.endpoint.baseUrl, DEFAULT_SETTINGS.endpoint.baseUrl, 'a partial endpoint patch keeps the rest');
  });
});
