// The local API: chats and settings stored under data/, and the AI calls.
// createApp takes the AI as a dependency so tests can swap in a fake.

import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextOf, settingsFor } from '../shared/context.ts';
import { kanjiKnownIn, stripFurigana } from '../shared/kanji.ts';
import type { Chat, Message, ModelTest, Politeness, ProviderKind, ReplyStatus, ReplyStep, Settings } from '../shared/types.ts';
import { AiError, callAi as realCallAi, listModels as realListModels, type AiRequest } from './ai/index.ts';
import { generateBreakdown, generateFeedback, generateReply } from './generate.ts';
import { testRequest } from './prompts.ts';
import * as store from './store.ts';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

export interface AppDeps {
  callAi: (request: AiRequest, settings: Settings) => Promise<unknown>;
  listModels: typeof realListModels;
  /** Serve the built UI from dist/ when it exists. */
  serveUi: boolean;
  /**
   * In LAN mode (`pnpm start:lan`), this machine's own addresses, answered as well as loopback. Asked per request,
   * so a new Wi-Fi address works without a restart.
   */
  lanHosts: () => Iterable<string>;
}

class NotFound extends Error {}
class BadRequest extends Error {}

/** A reply being written: its current step, and when it started. */
interface ReplyProgress {
  step: ReplyStep;
  startedAt: number;
}

const asPoliteness = (v: unknown): Politeness | undefined => (v === 'polite' || v === 'casual' ? v : undefined);

/**
 * Listening on 127.0.0.1 keeps the network out but not web pages: a site can
 * rebind its own hostname to 127.0.0.1 (then it is same-origin and can read
 * and write everything), or post here cross-site. So only loopback hostnames
 * are answered, and a request a page sends must come from a loopback origin.
 * In LAN mode this machine's own IP addresses are answered too: a rebinding
 * page's Host is always its own hostname, never a bare IP, so that stays shut.
 */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const NO_LAN = (): Iterable<string> => [];

export function fromThisMachine(host: string | undefined, origin: string | undefined, lanHosts = NO_LAN): boolean {
  const allowed = (name: string) => LOOPBACK.has(name) || [...lanHosts()].includes(name);
  if (!allowed((host ?? '').replace(/:\d+$/, '').toLowerCase())) return false;
  if (origin === undefined) return true;
  try {
    return allowed(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function titleFrom(text: string): string {
  const plain = stripFurigana(text).replace(/\s+/g, ' ').trim();
  return plain.length > 24 ? `${plain.slice(0, 24)}…` : plain;
}

export function createApp(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = { callAi: realCallAi, listModels: realListModels, serveUi: true, lanHosts: NO_LAN, ...overrides };
  const app = express();
  app.use((req, res, next) => {
    if (fromThisMachine(req.headers.host, req.headers.origin, deps.lanHosts)) return next();
    res.status(403).json({ error: 'only answers requests from this machine' });
  });
  app.use(express.json({ limit: '1mb' }));

  type Handler = (req: Request, res: Response) => Promise<unknown>;
  const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

  /**
   * One read-modify-write at a time per chat, so a reply and a breakdown finishing together don't overwrite each other.
   * The change says what it did: only a change to the `conversation` moves the chat to the top of the list; `meta`
   * (analyses, renames) saves it in place; `none` saves nothing.
   */
  const locks = new Map<string, Promise<unknown>>();
  async function updateChat(id: string, change: (chat: Chat) => 'conversation' | 'meta' | 'none'): Promise<Chat> {
    const run = (locks.get(id) ?? Promise.resolve()).then(async () => {
      const chat = await loadChat(id);
      const changed = change(chat);
      if (changed === 'none') return chat;
      if (changed === 'conversation') chat.updatedAt = store.now();
      return store.saveChat(chat);
    });
    locks.set(id, run.catch(() => undefined));
    return run;
  }

  async function loadChat(id: string): Promise<Chat> {
    const chat = store.isChatId(id) ? await store.getChat(id) : null;
    if (!chat) throw new NotFound('chat not found');
    chat.politeness ??= 'polite';
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

  /** A one-line round trip to the model the Settings dialog has chosen, saved or not. */
  app.post(
    '/api/test-model',
    route(async (req, res) => {
      const saved = await store.getSettings();
      const settings: Settings = {
        ...saved,
        provider: req.body?.provider === 'claude' || req.body?.provider === 'endpoint' ? req.body.provider : saved.provider,
        endpoint: { ...saved.endpoint, ...req.body?.endpoint },
        claude: { ...saved.claude, ...req.body?.claude },
      };
      const started = Date.now();
      const reply = String(await deps.callAi(testRequest(), settings)).trim();
      res.json({ reply, ms: Date.now() - started } satisfies ModelTest);
    }),
  );

  // --- chats ---

  app.get('/api/chats', route(async (_req, res) => res.json(await store.listChats())));

  app.post(
    '/api/chats',
    route(async (req, res) => {
      const topic = String(req.body?.topic ?? '').trim();
      const politeness = asPoliteness(req.body?.politeness) ?? 'polite';
      const time = store.now();
      const chat: Chat = { id: store.newId(), title: topic, topic, politeness, createdAt: time, updatedAt: time, messages: [] };
      res.json(await store.saveChat(chat));
    }),
  );

  /**
   * Replies being written, by chat id, with the message each answers and the settings it was started under.
   * Another request to answer the same message under the same settings waits for it instead of starting another;
   * one under new settings (say, after switching away from a model that hangs) starts afresh.
   */
  const replies = new Map<string, { answering: string | undefined; settings: string; reply: Promise<Chat>; progress: ReplyProgress }>();

  app.get(
    '/api/chats/:id',
    route(async (req, res) => {
      const chat = await loadChat(String(req.params.id));
      res.json(replies.has(chat.id) ? { ...chat, replying: true } : chat);
    }),
  );

  /** The chat's own settings: title, topic and speech style, each only when sent. They apply from the next message on. */
  app.patch(
    '/api/chats/:id',
    route(async (req, res) => {
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined;
      const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : undefined;
      const politeness = asPoliteness(req.body?.politeness);
      res.json(
        await updateChat(String(req.params.id), (chat) => {
          if (title) chat.title = title;
          if (topic !== undefined) chat.topic = topic;
          if (politeness) chat.politeness = politeness;
          return 'meta';
        }),
      );
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

  /** Saves the composer's unsent text. Answers without the chat, so a slow save can't overwrite a newer view. */
  app.put(
    '/api/chats/:id/draft',
    route(async (req, res) => {
      const draft = req.body?.draft;
      if (typeof draft !== 'string') throw new BadRequest('draft must be a string');
      await updateChat(String(req.params.id), (chat) => {
        if ((chat.draft ?? '') === draft) return 'none';
        if (draft) chat.draft = draft;
        else delete chat.draft;
        return 'meta';
      });
      res.json({ ok: true });
    }),
  );

  /** The pinned feedback's close button. */
  app.delete(
    '/api/chats/:id/pinned',
    route(async (req, res) => {
      res.json(
        await updateChat(String(req.params.id), (chat) => {
          if (!chat.pinned) return 'none';
          delete chat.pinned;
          return 'meta';
        }),
      );
    }),
  );

  /** A new message moves the conversation on: the last rewind can no longer be undone. */
  function addMessage(chat: Chat, message: Message) {
    chat.messages.push(message);
    delete chat.undo;
  }

  /**
   * Adds the learner's message. The reply is a separate call, so a failed reply can be retried without resending.
   * The composer is empty once it's sent, and the feedback pinned for fixing it has done its job.
   */
  app.post(
    '/api/chats/:id/messages',
    route(async (req, res) => {
      const content = String(req.body?.content ?? '').trim();
      if (!content) return res.status(400).json({ error: 'empty message' });
      const settings = await store.getSettings();
      res.json(
        await updateChat(String(req.params.id), (chat) => {
          addMessage(chat, { id: store.newId(), role: 'user', content, createdAt: store.now(), context: contextOf(settings, chat.politeness) });
          delete chat.draft;
          delete chat.pinned;
          return 'conversation';
        }),
      );
    }),
  );

  async function writeReply(chat: Chat, settings: Settings, progress: ReplyProgress): Promise<Chat> {
    const answering = chat.messages.at(-1)?.id;
    const content = await generateReply(deps.callAi, settings, chat, {
      onStep: (step) => {
        progress.step = step;
      },
    });
    const message: Message = { id: store.newId(), role: 'assistant', content, createdAt: store.now(), context: contextOf(settings, chat.politeness) };
    return updateChat(chat.id, (chat) => {
      // Rewound, or answered by another reply, while this one was being written: it answers a history that is gone.
      if (chat.messages.at(-1)?.id !== answering) return 'none';
      addMessage(chat, message);
      if (!chat.title) chat.title = titleFrom(content);
      return 'conversation';
    });
  }

  /** How far a reply being written has got, for the typing indicator. */
  app.get(
    '/api/chats/:id/reply',
    route(async (req, res) => {
      const progress = replies.get(String(req.params.id))?.progress;
      const status: ReplyStatus = progress ? { replying: true, step: progress.step, elapsedMs: Date.now() - progress.startedAt } : { replying: false };
      res.json(status);
    }),
  );

  /**
   * The partner's next message -- the opener when the chat is empty. If one is already being written
   * (the page was reloaded while waiting), this waits for it and answers with the same result.
   */
  app.post(
    '/api/chats/:id/reply',
    route(async (req, res) => {
      const id = String(req.params.id);
      // Taken before anything is awaited: a reply in flight now may land while the chat loads, and is still the one to join.
      const inFlight = replies.get(id);
      const settings = await store.getSettings();
      const chat = await loadChat(id);
      const answering = chat.messages.at(-1)?.id;
      // The partner never answers itself: a page that was waiting for a reply that has since landed gets the chat as it is.
      if (chat.messages.at(-1)?.role === 'assistant') return res.json(chat);
      const key = JSON.stringify(settings);
      let pending = replies.get(id) ?? inFlight;
      if (!pending || pending.answering !== answering || pending.settings !== key) {
        const progress: ReplyProgress = { step: 'draft', startedAt: Date.now() };
        const reply: Promise<Chat> = writeReply(chat, settings, progress).finally(() => {
          if (replies.get(id)?.reply === reply) replies.delete(id);
        });
        pending = { answering, settings: key, reply, progress };
        replies.set(id, pending);
      }
      res.json(await pending.reply);
    }),
  );

  /**
   * Deletes one of the learner's messages and everything after it, all in one write: its text goes into the draft
   * (above what the page says is typed, `draft` in the body, so nothing still waiting to be saved is lost), its
   * feedback is pinned, and what was there before is kept so the rewind can be undone.
   */
  app.post(
    '/api/chats/:id/messages/:mid/rewind',
    route(async (req, res) => {
      const mid = String(req.params.mid);
      const typed = typeof req.body?.draft === 'string' ? (req.body.draft as string) : undefined;
      res.json(
        await updateChat(String(req.params.id), (chat) => {
          const index = chat.messages.findIndex((m) => m.id === mid);
          if (index < 0) throw new NotFound('message not found');
          if (chat.messages[index].role !== 'user') throw new BadRequest("only the learner's messages can be rewound to");
          const before = typed ?? chat.draft ?? '';
          const removed = chat.messages.splice(index);
          const [rewound] = removed;
          chat.undo = { messages: removed, draft: before, ...(chat.pinned && { pinned: chat.pinned }) };
          chat.draft = before.trim() ? `${rewound.content}\n\n${before}` : rewound.content;
          if (rewound.feedback) chat.pinned = { content: rewound.content, feedback: rewound.feedback };
          else delete chat.pinned;
          return 'conversation';
        }),
      );
    }),
  );

  /** Puts back what the last rewind removed, and the draft and pinned feedback from before it. */
  app.post(
    '/api/chats/:id/undo-rewind',
    route(async (req, res) => {
      res.json(
        await updateChat(String(req.params.id), (chat) => {
          const undo = chat.undo;
          if (!undo) throw new BadRequest('nothing to undo');
          chat.messages.push(...undo.messages);
          if (undo.draft) chat.draft = undo.draft;
          else delete chat.draft;
          if (undo.pinned) chat.pinned = undo.pinned;
          else delete chat.pinned;
          delete chat.undo;
          return 'conversation';
        }),
      );
    }),
  );

  /** Analyses being written, by chat/message: asking again meanwhile (the page came back to an open panel) waits for the same one. */
  const analysing = new Map<string, Promise<Partial<Message>>>();

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

      const key = `${id}/${mid}`;
      let work = refresh ? undefined : analysing.get(key);
      if (!work) {
        work = (async (): Promise<Partial<Message>> => {
          // Under the settings the message was written with, so changing them since doesn't change the answer.
          const settings = settingsFor(await store.getSettings(), message.context);
          const earlier = chat.messages.slice(0, index);
          // Anywhere in the chat, as the UI counts them: once typed, the learner knows it.
          const known = kanjiKnownIn(chat);
          if (message.role === 'assistant') return { breakdown: await generateBreakdown(deps.callAi, settings, message, earlier, known) };
          const politeness = message.context?.politeness ?? chat.politeness;
          return { feedback: await generateFeedback(deps.callAi, settings, politeness, message, earlier, known) };
        })();
        if (!refresh) {
          analysing.set(key, work);
          const done = () => analysing.get(key) === work && analysing.delete(key);
          work.then(done, done);
        }
      }
      const patch = await work;
      const saved = await updateChat(id, (c) => {
        const m = c.messages.find((x) => x.id === mid);
        if (!m) return 'none';
        Object.assign(m, patch);
        return 'meta';
      });
      const analysed = saved.messages.find((m) => m.id === mid);
      if (!analysed) throw new NotFound('message not found -- rewound while it was being analysed');
      res.json(analysed);
    }),
  );

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  if (deps.serveUi && fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof NotFound ? 404 : err instanceof BadRequest ? 400 : err instanceof AiError ? 502 : 500;
    if (status === 500) console.error(err);
    else if (status === 502) console.warn(`[api] ${err.message}`);
    res.status(status).json({ error: err.message });
  });

  return app;
}

export const hasBuiltUi = () => fs.existsSync(DIST);
