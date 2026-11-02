// The local API: chats and settings stored under data/, and the AI calls.
// createApp takes the AI as a dependency so tests can swap in a fake.

import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripFurigana } from '../shared/kanji.ts';
import type { Chat, Message, ProviderKind, Settings } from '../shared/types.ts';
import { AiError, callAi as realCallAi, listModels as realListModels, type AiRequest } from './ai/index.ts';
import { generateBreakdown, generateFeedback, generateReply } from './generate.ts';
import * as store from './store.ts';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export interface AppDeps {
  callAi: (request: AiRequest, settings: Settings) => Promise<unknown>;
  listModels: typeof realListModels;
  /** Serve the built UI from dist/ when it exists. */
  serveUi: boolean;
}

class NotFound extends Error {}

function titleFrom(text: string): string {
  const plain = stripFurigana(text).replace(/\s+/g, ' ').trim();
  return plain.length > 24 ? `${plain.slice(0, 24)}…` : plain;
}

export function createApp(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = { callAi: realCallAi, listModels: realListModels, serveUi: true, ...overrides };
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  type Handler = (req: Request, res: Response) => Promise<unknown>;
  const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

  /** One read-modify-write at a time per chat, so a reply and a breakdown finishing together don't overwrite each other. */
  const locks = new Map<string, Promise<unknown>>();
  async function updateChat(id: string, change: (chat: Chat) => void): Promise<Chat> {
    const run = (locks.get(id) ?? Promise.resolve()).then(async () => {
      const chat = await loadChat(id);
      change(chat);
      chat.updatedAt = store.now();
      return store.saveChat(chat);
    });
    locks.set(id, run.catch(() => undefined));
    return run;
  }

  async function loadChat(id: string): Promise<Chat> {
    const chat = store.isChatId(id) ? await store.getChat(id) : null;
    if (!chat) throw new NotFound('chat not found');
    return chat;
  }

  // --- settings and models ---

  app.get('/api/settings', route(async (_req, res) => res.json(await store.getSettings())));

  app.put('/api/settings', route(async (req, res) => res.json(await store.saveSettings(req.body ?? {}))));

  app.post(
    '/api/models',
    route(async (req, res) => {
      const settings = await store.getSettings();
      const provider = (req.body?.provider as ProviderKind) ?? settings.provider;
      res.json(await deps.listModels(provider, { ...settings.endpoint, ...req.body?.endpoint }));
    }),
  );

  // --- chats ---

  app.get('/api/chats', route(async (_req, res) => res.json(await store.listChats())));

  app.post(
    '/api/chats',
    route(async (req, res) => {
      const topic = String(req.body?.topic ?? '').trim();
      const time = store.now();
      const chat: Chat = { id: store.newId(), title: topic, topic, createdAt: time, updatedAt: time, messages: [] };
      res.json(await store.saveChat(chat));
    }),
  );

  app.get('/api/chats/:id', route(async (req, res) => res.json(await loadChat(String(req.params.id)))));

  app.patch(
    '/api/chats/:id',
    route(async (req, res) => {
      const title = String(req.body?.title ?? '').trim();
      res.json(await updateChat(String(req.params.id), (chat) => void (chat.title = title)));
    }),
  );

  app.delete(
    '/api/chats/:id',
    route(async (req, res) => {
      const id = String(req.params.id);
      if (!store.isChatId(id)) throw new NotFound('chat not found');
      await store.deleteChat(id);
      res.json({ ok: true });
    }),
  );

  /** Adds the learner's message. The reply is a separate call, so a failed reply can be retried without resending. */
  app.post(
    '/api/chats/:id/messages',
    route(async (req, res) => {
      const content = String(req.body?.content ?? '').trim();
      if (!content) return res.status(400).json({ error: 'empty message' });
      const message: Message = { id: store.newId(), role: 'user', content, createdAt: store.now() };
      res.json(await updateChat(String(req.params.id), (chat) => void chat.messages.push(message)));
    }),
  );

  /** The partner's next message -- the opener when the chat is empty. */
  app.post(
    '/api/chats/:id/reply',
    route(async (req, res) => {
      const id = String(req.params.id);
      const settings = await store.getSettings();
      const content = await generateReply(deps.callAi, settings, await loadChat(id));
      const message: Message = { id: store.newId(), role: 'assistant', content, createdAt: store.now() };
      res.json(
        await updateChat(id, (chat) => {
          chat.messages.push(message);
          if (!chat.title) chat.title = titleFrom(content);
        }),
      );
    }),
  );

  /** A breakdown of the partner's message, or feedback on the learner's. Cached on the message unless ?refresh=1. */
  app.post(
    '/api/chats/:id/messages/:mid/analyze',
    route(async (req, res) => {
      const id = String(req.params.id);
      const mid = String(req.params.mid);
      const chat = await loadChat(id);
      const index = chat.messages.findIndex((m) => m.id === mid);
      if (index < 0) throw new NotFound('message not found');
      const message = chat.messages[index];
      const refresh = req.query.refresh === '1';
      if (!refresh && (message.breakdown || message.feedback)) return res.json(message);

      const settings = await store.getSettings();
      let patch: Partial<Message>;
      if (message.role === 'assistant') {
        patch = { breakdown: await generateBreakdown(deps.callAi, settings, message) };
      } else {
        const previous = chat.messages.slice(0, index).findLast((m) => m.role === 'assistant');
        patch = { feedback: await generateFeedback(deps.callAi, settings, message, previous) };
      }
      const saved = await updateChat(id, (c) => {
        const m = c.messages.find((x) => x.id === mid);
        if (m) Object.assign(m, patch);
      });
      res.json(saved.messages.find((m) => m.id === mid));
    }),
  );

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  if (deps.serveUi && fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof NotFound ? 404 : err instanceof AiError ? 502 : 500;
    if (status === 500) console.error(err);
    else if (status === 502) console.warn(`[api] ${err.message}`);
    res.status(status).json({ error: err.message });
  });

  return app;
}

export const hasBuiltUi = () => fs.existsSync(DIST);
