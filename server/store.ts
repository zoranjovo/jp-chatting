// Everything the app keeps lives in data/ (git-ignored) as plain JSON:
//   data/settings.json      the user's settings
//   data/chats/<id>.json    one file per chat, messages included

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MAX_GENKI_LESSON } from '../shared/genki.ts';
import { asJlptLevel } from '../shared/jlpt.ts';
import { clampWkLevel } from '../shared/kanji.ts';
import { DEFAULT_SETTINGS, ENDPOINT_REASONING, type Chat, type ChatSummary, type Politeness, type Settings } from '../shared/types.ts';

const DEFAULT_DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

/** Read on every call, so tests can point JP_CHATTING_DATA at a temp dir. */
const dataDir = () => process.env.JP_CHATTING_DATA || DEFAULT_DATA_DIR;
const chatsDir = () => path.join(dataDir(), 'chats');
const settingsFile = () => path.join(dataDir(), 'settings.json');

const ID = /^[a-zA-Z0-9-]+$/;

export const isChatId = (id: string) => ID.test(id);

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Runs `fn` after every earlier call with the same key has finished. */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn);
  const tail = run.catch(() => undefined);
  queues.set(key, tail);
  tail.then(() => queues.get(key) === tail && queues.delete(key));
  return run;
}

/** Windows refuses a rename while something (another rename, antivirus, the indexer) has the target open. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fs.rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      await new Promise((r) => setTimeout(r, 20 * 2 ** attempt));
    }
  }
}

/** Writes through a temp file so a crash mid-write never leaves half a file. */
async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await renameWithRetry(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/** Model aliases older versions saved, pinned to the model they meant then ('' was the "Default" option, Sonnet 5.5). */
const CLAUDE_ALIASES: Record<string, string> = { '': 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };

/** Fills in fields a settings file from an older version lacks. */
function withDefaults(saved: (Partial<Settings> & { politeness?: unknown }) | null): Settings {
  const claude = { ...DEFAULT_SETTINGS.claude, ...saved?.claude };
  claude.model = CLAUDE_ALIASES[claude.model] ?? claude.model;
  // politeness moved to each chat; migrateLegacy() hands it to the chats that predate that.
  const { politeness: _moved, ...rest } = saved ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    endpoint: { ...DEFAULT_SETTINGS.endpoint, ...saved?.endpoint },
    claude,
  };
}

/**
 * Data from before politeness was a per-chat choice: chats without one get the
 * style the old settings had, and the setting is dropped. Runs at startup;
 * a no-op once done.
 */
export async function migrateLegacy(): Promise<void> {
  const raw = await readJson<{ politeness?: unknown }>(settingsFile());
  const legacy: Politeness = raw?.politeness === 'casual' ? 'casual' : 'polite';
  for (const summary of await listChats()) {
    const chat = await getChat(summary.id);
    if (chat && !chat.politeness) await saveChat({ ...chat, politeness: legacy });
  }
  if (raw && 'politeness' in raw) await saveSettings({});
}

export async function getSettings(): Promise<Settings> {
  return withDefaults(await readJson<Partial<Settings>>(settingsFile()));
}

/** Read-modify-write, one at a time, so two quick changes (say, language then furigana) both stick. */
export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  return serial(settingsFile(), async () => {
    const current = await getSettings();
    const next = withDefaults({
      ...current,
      ...patch,
      endpoint: { ...current.endpoint, ...patch.endpoint },
      claude: { ...current.claude, ...patch.claude },
    });
    next.wkLevel = clampWkLevel(Number(next.wkLevel) || 0);
    next.genkiLesson = Math.max(0, Math.min(MAX_GENKI_LESSON, Math.round(Number(next.genkiLesson) || 0)));
    next.jlptLevel = asJlptLevel(next.jlptLevel);
    if (!ENDPOINT_REASONING.includes(next.endpoint.reasoning)) next.endpoint.reasoning = '';
    await writeJson(settingsFile(), next);
    return next;
  });
}

function chatFile(id: string): string {
  if (!ID.test(id)) throw new Error(`bad chat id: ${id}`);
  return path.join(chatsDir(), `${id}.json`);
}

export async function listChats(): Promise<ChatSummary[]> {
  let files: string[];
  try {
    files = await fs.readdir(chatsDir());
  } catch {
    return [];
  }
  const chats = await Promise.all(files.filter((f) => f.endsWith('.json')).map((f) => readJson<Chat>(path.join(chatsDir(), f))));
  return chats
    .filter((c): c is Chat => !!c)
    .map(({ id, title, topic, createdAt, updatedAt }) => ({ id, title, topic, createdAt, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getChat(id: string): Promise<Chat | null> {
  return readJson<Chat>(chatFile(id));
}

export async function saveChat(chat: Chat): Promise<Chat> {
  const file = chatFile(chat.id);
  await serial(file, () => writeJson(file, chat));
  return chat;
}

export async function deleteChat(id: string): Promise<void> {
  await fs.rm(chatFile(id), { force: true });
}

export function newId(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}
