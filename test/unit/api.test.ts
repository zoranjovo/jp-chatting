import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, beforeEach, describe, test } from 'node:test';
import { AiError, type AiRequest } from '../../server/ai/index.ts';
import { createApp, fromLoopback } from '../../server/app.ts';
import { BREAKDOWN_SCHEMA, FEEDBACK_SCHEMA } from '../../server/prompts.ts';
import type { Chat, Message, ModelList, Settings } from '../../shared/types.ts';
import { clearTempData, useTempData } from './helpers.ts';

await useTempData();

// --- a scripted AI ---

type Kind = 'chat' | 'rewrite' | 'breakdown' | 'feedback';
const calls: { kind: Kind; request: AiRequest; settings: Settings }[] = [];
let answers: Partial<Record<Kind, (req: AiRequest) => unknown>> = {};

const kindOf = (r: AiRequest): Kind =>
  r.schema === BREAKDOWN_SCHEMA ? 'breakdown' : r.schema === FEEDBACK_SCHEMA ? 'feedback' : r.system.startsWith('You edit Japanese') ? 'rewrite' : 'chat';

const DEFAULT_ANSWERS: Record<Kind, (req: AiRequest) => unknown> = {
  chat: () => 'こんにちは！げんきですか？',
  rewrite: () => 'rewritten',
  breakdown: () => ({ lines: [{ japanese: 'こんにちは', translation: 'Hello', explanation: 'A greeting.', words: [] }] }),
  feedback: () => ({ meaning: 'Hi', verdict: 'correct', corrected: 'やあ', summary: 'Good.', lines: [] }),
};

async function fakeAi(request: AiRequest, settings: Settings): Promise<unknown> {
  const kind = kindOf(request);
  calls.push({ kind, request, settings });
  return (answers[kind] ?? DEFAULT_ANSWERS[kind])(request);
}

let modelsAsked: unknown[] = [];
const app = createApp({
  callAi: fakeAi,
  listModels: async (provider, endpoint) => {
    modelsAsked.push({ provider, endpoint });
    return { models: [`${provider}-model`] };
  },
  serveUi: false,
});
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

after(async () => {
  server.close();
  await clearTempData();
});

async function api<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(base + url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

const newChat = async (topic = '') => (await api<Chat>('POST', '/api/chats', { topic })).body;
const reply = async (id: string) => api<Chat>('POST', `/api/chats/${id}/reply`);
const send = async (id: string, content: string) => api<Chat>('POST', `/api/chats/${id}/messages`, { content });
const analyze = async (id: string, mid: string, refresh = false) =>
  api<Message>('POST', `/api/chats/${id}/messages/${mid}/analyze${refresh ? '?refresh=1' : ''}`);
const chatCalls = () => calls.filter((c) => c.kind === 'chat').length;

/** Polls instead of sleeping a fixed time, so a slow runner can't fail the test. */
async function until(condition: () => boolean, timeoutMs = 2000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 1));
  }
}

beforeEach(async () => {
  calls.length = 0;
  answers = {};
  modelsAsked = [];
  await api('PUT', '/api/settings', { wkLevel: 5, politeness: 'polite' });
});

describe('settings API', () => {
  test('reads and updates settings', async () => {
    const put = await api<Settings>('PUT', '/api/settings', { uiLanguage: 'ja', claude: { model: 'claude-opus-5-5' } });
    assert.equal(put.status, 200);
    assert.equal(put.body.uiLanguage, 'ja');
    const got = await api<Settings>('GET', '/api/settings');
    assert.equal(got.body.uiLanguage, 'ja');
    assert.equal(got.body.claude.model, 'claude-opus-5-5');
    assert.equal(got.body.claude.command, 'claude');
  });

  test('lists models for the asked provider with the unsaved endpoint merged over the saved one', async () => {
    await api('PUT', '/api/settings', { endpoint: { baseUrl: 'http://saved/v1', apiKey: 'saved-key' } });
    const res = await api<ModelList>('POST', '/api/models', { provider: 'endpoint', endpoint: { baseUrl: 'http://draft/v1' } });
    assert.deepEqual(res.body, { models: ['endpoint-model'] });
    assert.deepEqual(modelsAsked[0], { provider: 'endpoint', endpoint: { baseUrl: 'http://draft/v1', apiKey: 'saved-key', model: '', reasoning: '' } });
  });

  test('defaults to the saved provider', async () => {
    await api('PUT', '/api/settings', { provider: 'claude' });
    assert.deepEqual((await api('POST', '/api/models', {})).body, { models: ['claude-model'] });
    await api('PUT', '/api/settings', { provider: 'endpoint' });
  });
});

describe('loopback guard', () => {
  /** node:http, not fetch, so the Host header is sent exactly as given. */
  const raw = (method: string, url: string, headers: Record<string, string>) =>
    new Promise<number>((resolve, reject) => {
      const req = http.request(base + url, { method, headers }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end(method === 'GET' ? undefined : '{"wkLevel":60}');
    });

  test('a rebound hostname gets nothing', async () => {
    assert.equal(await raw('GET', '/api/settings', { Host: 'evil.example:5174' }), 403);
    assert.equal(await raw('PUT', '/api/settings', { Host: 'evil.example:5174', 'Content-Type': 'application/json' }), 403);
    assert.equal((await api<Settings>('GET', '/api/settings')).body.wkLevel, 5);
  });

  test('a page from another origin cannot post, even a simple form request', async () => {
    const port = new URL(base).port;
    assert.equal(await raw('POST', '/api/chats', { Host: `127.0.0.1:${port}`, Origin: 'https://evil.example', 'Content-Type': 'text/plain' }), 403);
    assert.equal(await raw('POST', '/api/chats', { Host: `127.0.0.1:${port}`, Origin: 'null', 'Content-Type': 'text/plain' }), 403);
  });

  test('the app itself, Vite and tools without an Origin get through', () => {
    assert.ok(fromLoopback('127.0.0.1:5174', undefined));
    assert.ok(fromLoopback('localhost:5173', 'http://localhost:5173'));
    assert.ok(fromLoopback('127.0.0.1:5173', 'http://127.0.0.1:5173'));
    assert.ok(fromLoopback('[::1]:5174', 'http://[::1]:5174'));
    assert.ok(!fromLoopback('127.0.0.1.evil.example', undefined));
    assert.ok(!fromLoopback(undefined, undefined));
  });
});

describe('chats API', () => {
  test('creates a chat titled after its topic', async () => {
    const chat = await newChat('  Ordering at a café ');
    assert.equal(chat.topic, 'Ordering at a café');
    assert.equal(chat.title, 'Ordering at a café');
    assert.deepEqual(chat.messages, []);
    const got = await api<Chat>('GET', `/api/chats/${chat.id}`);
    assert.equal(got.body.id, chat.id);
  });

  test('lists chats newest first', async () => {
    const a = await newChat('first');
    const b = await newChat('second');
    await send(a.id, 'bump');
    const list = (await api<Chat[]>('GET', '/api/chats')).body.map((c) => c.id);
    assert.ok(list.indexOf(a.id) < list.indexOf(b.id));
  });

  test('renames and deletes', async () => {
    const chat = await newChat('x');
    assert.equal((await api<Chat>('PATCH', `/api/chats/${chat.id}`, { title: ' New name ' })).body.title, 'New name');
    assert.deepEqual((await api('DELETE', `/api/chats/${chat.id}`)).body, { ok: true });
    assert.equal((await api('GET', `/api/chats/${chat.id}`)).status, 404);
  });

  test('unknown or malformed chat ids are 404s', async () => {
    assert.equal((await api('GET', '/api/chats/does-not-exist')).status, 404);
    assert.equal((await api('GET', '/api/chats/..%2Fsettings')).status, 404);
    assert.equal((await api('DELETE', '/api/chats/bad.id')).status, 404);
    assert.equal((await reply('does-not-exist')).status, 404);
    assert.equal((await send('does-not-exist', 'x')).status, 404);
  });

  test('unknown API routes are JSON 404s', async () => {
    const res = await api('GET', '/api/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'not found' });
  });
});

describe('conversation', () => {
  test('the first reply opens the chat from a cue, with the topic in the system prompt', async () => {
    const chat = await newChat('At the station');
    const res = await reply(chat.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.messages.length, 1);
    assert.equal(res.body.messages[0].role, 'assistant');
    assert.equal(res.body.messages[0].content, 'こんにちは！げんきですか？');
    const [call] = calls;
    assert.equal(call.kind, 'chat');
    assert.match(call.request.system, /At the station/);
    assert.match(call.request.turns[0].content, /Start the conversation/);
  });

  test('a chat without a topic is titled after the opener, shortened', async () => {
    answers.chat = () => '{今日|きょう}はいい{天気|てんき}ですね。どこかへ{出|で}かけますか？それとも{家|いえ}にいますか？';
    await api('PUT', '/api/settings', { wkLevel: 60 });
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.equal(res.body.title, '今日はいい天気ですね。どこかへ出かけますか？それ…', 'first 24 characters, markup stripped');
  });

  test('the learner\'s message is stored, then the reply sees the whole history', async () => {
    const chat = await newChat();
    await reply(chat.id);
    const sent = await send(chat.id, '  げんきです！ ');
    assert.equal(sent.body.messages.at(-1)!.content, 'げんきです！');
    assert.equal(sent.body.messages.at(-1)!.role, 'user');
    calls.length = 0;
    const res = await reply(chat.id);
    assert.equal(res.body.messages.length, 3);
    assert.deepEqual(calls[0].request.turns.map((t) => t.role), ['user', 'assistant', 'user']);
    assert.equal(calls[0].request.turns[2].content, 'げんきです！');
  });

  test('a reply asked for again while one is being written waits for it, and reads show it is coming', async () => {
    const chat = await newChat();
    let finish!: (text: string) => void;
    answers.chat = () => new Promise<string>((r) => (finish = r));
    const first = reply(chat.id);
    await until(() => chatCalls() === 1);
    // Any second model call answers at once, so a regression fails the count below instead of hanging the run.
    answers.chat = DEFAULT_ANSWERS.chat;
    assert.equal((await api<Chat>('GET', `/api/chats/${chat.id}`)).body.replying, true);
    // Whether it joins the first, catches it just as it lands, or arrives after, the second gets the same chat and makes no call.
    const second = reply(chat.id);
    finish('はい、どうぞ。');
    const [a, b] = await Promise.all([first, second]);
    assert.equal(calls.filter((c) => c.kind === 'chat').length, 1, 'one model call');
    assert.deepEqual(a.body, b.body);
    assert.equal(a.body.messages.length, 1);
    const after = (await api<Chat>('GET', `/api/chats/${chat.id}`)).body;
    assert.equal(after.replying, undefined);
    assert.equal(after.messages.length, 1);
  });

  test('the partner never answers itself: asking again after a reply landed changes nothing', async () => {
    const chat = await newChat();
    await reply(chat.id);
    calls.length = 0;
    const again = await reply(chat.id);
    assert.equal(again.status, 200);
    assert.equal(again.body.messages.length, 1);
    assert.equal(chatCalls(), 0);
  });

  test('a reply to a message that was rewound away is not joined; the new message gets its own', async () => {
    const chat = await newChat();
    await reply(chat.id);
    const m1 = (await send(chat.id, 'ひとつめ')).body.messages[1];
    let finish!: (text: string) => void;
    answers.chat = () => new Promise<string>((r) => (finish = r));
    const late = reply(chat.id);
    await until(() => chatCalls() === 2);
    await api('POST', `/api/chats/${chat.id}/messages/${m1.id}/rewind`);
    await send(chat.id, 'ふたつめ');
    answers.chat = () => 'はい。';
    const fresh = await reply(chat.id);
    assert.deepEqual(fresh.body.messages.map((m) => m.content).slice(1), ['ふたつめ', 'はい。']);
    finish('おそい');
    assert.equal((await late).body.messages.length, 3, 'the late reply is dropped');
  });

  test('a reply under new settings starts afresh instead of waiting for one that may hang', async () => {
    const chat = await newChat();
    let release!: (text: string) => void;
    answers.chat = () => new Promise<string>((r) => (release = r));
    const stuck = reply(chat.id);
    await until(() => chatCalls() === 1);
    await api('PUT', '/api/settings', { endpoint: { model: 'another' } });
    answers.chat = () => 'こんにちは！';
    const res = await reply(chat.id);
    assert.equal(res.body.messages.length, 1);
    assert.equal(chatCalls(), 2);
    // The stuck one finishing late is dropped: the opener is already there.
    release('おそい');
    assert.equal((await stuck).body.messages.length, 1);
  });

  test('a failed reply is not left marked as coming', async () => {
    const chat = await newChat();
    answers.chat = () => {
      throw new AiError('down');
    };
    assert.equal((await reply(chat.id)).status, 502);
    assert.equal((await api<Chat>('GET', `/api/chats/${chat.id}`)).body.replying, undefined);
    answers.chat = DEFAULT_ANSWERS.chat;
    assert.equal((await reply(chat.id)).body.messages.length, 1);
  });

  test('an empty message is refused', async () => {
    const chat = await newChat();
    const res = await send(chat.id, '   ');
    assert.equal(res.status, 400);
    assert.equal((await api<Chat>('GET', `/api/chats/${chat.id}`)).body.messages.length, 0);
  });

  test('an AI failure is a 502 with its message, and nothing is saved', async () => {
    answers.chat = () => {
      throw new AiError('the endpoint answered 500: boom');
    };
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.equal(res.status, 502);
    assert.match((res.body as unknown as { error: string }).error, /boom/);
    assert.equal((await api<Chat>('GET', `/api/chats/${chat.id}`)).body.messages.length, 0);
  });
});

describe('kanji level enforcement', () => {
  // 語 is WaniKani level 5+; 人 is level 1.
  test('a reply within the level is not rewritten', async () => {
    answers.chat = () => '{人|ひと}がいます。';
    const chat = await newChat();
    await reply(chat.id);
    assert.deepEqual(calls.map((c) => c.kind), ['chat']);
  });

  test('kanji above the level with a reading are spelled out in kana, with no extra call', async () => {
    await api('PUT', '/api/settings', { wkLevel: 1 });
    answers.chat = () => '{日本語|にほんご}を{話|はな}しますか？{人|ひと}は{飲み物|のみもの}';
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.deepEqual(calls.map((c) => c.kind), ['chat']);
    assert.equal(res.body.messages[0].content, 'にほんごをはなしますか？{人|ひと}はのみもの');
  });

  test('bare kanji above the level are rewritten, and the rewrite is kept when it is better', async () => {
    await api('PUT', '/api/settings', { wkLevel: 1 });
    answers.chat = () => '日本語を話しますか？';
    answers.rewrite = () => 'にほんごをはなしますか？';
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.deepEqual(calls.map((c) => c.kind), ['chat', 'rewrite']);
    assert.match(calls[1].request.turns[0].content, /does not know: 日 本 語 話/);
    assert.equal(res.body.messages[0].content, 'にほんごをはなしますか？');
  });

  test('a rewrite that is no better is dropped', async () => {
    await api('PUT', '/api/settings', { wkLevel: 1 });
    answers.chat = () => '話します';
    answers.rewrite = () => '話す';
    const chat = await newChat();
    assert.equal((await reply(chat.id)).body.messages[0].content, '話します');
  });

  test('the rewrite is spelled out too before it is judged', async () => {
    await api('PUT', '/api/settings', { wkLevel: 1 });
    answers.chat = () => '話します';
    answers.rewrite = () => '{話|はな}します';
    const chat = await newChat();
    assert.equal((await reply(chat.id)).body.messages[0].content, 'はなします');
  });

  test('a failed rewrite keeps the original reply', async () => {
    await api('PUT', '/api/settings', { wkLevel: 1 });
    answers.chat = () => '話します';
    answers.rewrite = () => {
      throw new AiError('nope');
    };
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.equal(res.status, 200);
    assert.equal(res.body.messages[0].content, '話します');
  });
});

describe('analysis', () => {
  async function chatWithBoth() {
    const chat = await newChat();
    await reply(chat.id);
    const sent = await send(chat.id, 'げんきです');
    calls.length = 0;
    const [partner, mine] = sent.body.messages;
    return { chat, partner, mine };
  }

  test('a partner message gets a breakdown, cached on the message', async () => {
    const { chat, partner } = await chatWithBoth();
    const first = await analyze(chat.id, partner.id);
    assert.equal(first.status, 200);
    assert.equal(first.body.breakdown!.lines[0].translation, 'Hello');
    assert.equal(first.body.feedback, undefined);
    await analyze(chat.id, partner.id);
    assert.equal(calls.length, 1, 'the second request is served from the cache');
    const stored = (await api<Chat>('GET', `/api/chats/${chat.id}`)).body.messages[0];
    assert.deepEqual(stored.breakdown, first.body.breakdown);
  });

  test('refresh asks again', async () => {
    const { chat, partner } = await chatWithBoth();
    await analyze(chat.id, partner.id);
    answers.breakdown = () => ({ lines: [{ japanese: 'x', translation: 'Again', explanation: '', words: [] }] });
    const again = await analyze(chat.id, partner.id, true);
    assert.equal(calls.length, 2);
    assert.equal(again.body.breakdown!.lines[0].translation, 'Again');
  });

  test('a learner message gets feedback that knows what it replied to', async () => {
    const { chat, mine } = await chatWithBoth();
    const res = await analyze(chat.id, mine.id);
    assert.equal(res.body.feedback!.verdict, 'correct');
    assert.equal(res.body.breakdown, undefined);
    assert.equal(calls[0].kind, 'feedback');
    assert.match(calls[0].request.turns[0].content, /replying to:\nこんにちは！げんきですか？/);
  });

  test('a malformed AI answer is coerced into shape', async () => {
    const { chat, mine } = await chatWithBoth();
    answers.feedback = () => ({ verdict: 'amazing', lines: 'garbage' });
    const res = await analyze(chat.id, mine.id);
    assert.equal(res.body.feedback!.verdict, 'minor');
    assert.deepEqual(res.body.feedback!.lines, []);
  });

  test('an unknown message is a 404', async () => {
    const { chat } = await chatWithBoth();
    assert.equal((await analyze(chat.id, 'nope')).status, 404);
  });

  test('analysing two messages at once saves both', async () => {
    const { chat, partner, mine } = await chatWithBoth();
    await Promise.all([analyze(chat.id, partner.id), analyze(chat.id, mine.id), send(chat.id, 'もう一つ')]);
    const stored = (await api<Chat>('GET', `/api/chats/${chat.id}`)).body;
    assert.ok(stored.messages[0].breakdown);
    assert.ok(stored.messages[1].feedback);
    assert.equal(stored.messages.length, 3);
  });
});

describe('reply clean-up', () => {
  test('furigana on kana-only words is dropped without asking the model again', async () => {
    answers.chat = () => '{カフェ|cafe}へようこそ！{何|なに}を{飲|の}みますか？';
    await api('PUT', '/api/settings', { wkLevel: 60 });
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.equal(res.body.messages[0].content, 'カフェへようこそ！{何|なに}を{飲|の}みますか？');
    assert.deepEqual(calls.map((c) => c.kind), ['chat']);
  });

  test('a clean message with an English note after it is kept without the note, with no extra call', async () => {
    await api('PUT', '/api/settings', { wkLevel: 60 });
    answers.chat = () => 'いらっしゃいませ！{何|なに}を{飲|の}みますか？  Wait, I need to check the kanji and format carefully. <think>The learner opened a chat';
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.deepEqual(calls.map((c) => c.kind), ['chat']);
    assert.equal(res.body.messages[0].content, 'いらっしゃいませ！{何|なに}を{飲|の}みますか？');
  });

  test('when the model corrects itself mid-reply, the corrected version after the note is kept', async () => {
    await api('PUT', '/api/settings', { wkLevel: 1 });
    answers.chat = () => '今日は何をする？ Wait, I must check kanji: 何 not in list. Let me rewrite. きょうはなにをする？';
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.deepEqual(calls.map((c) => c.kind), ['chat']);
    assert.equal(res.body.messages[0].content, 'きょうはなにをする？');
  });

  test('English that cannot be cut away is sent back for a rewrite', async () => {
    answers.chat = () => 'いらっしゃいませ！ please wait a moment ちょっとまってください。';
    answers.rewrite = () => 'いらっしゃいませ！ちょっとまってください。';
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.deepEqual(calls.map((c) => c.kind), ['chat', 'rewrite']);
    assert.match(calls[1].request.turns[0].content, /English, romaji or a note/);
    assert.equal(res.body.messages[0].content, 'いらっしゃいませ！ちょっとまってください。');
  });

  test('if the rewrite fails, one fresh reply is drawn and the cleaner one wins', async () => {
    let n = 0;
    answers.chat = () => (n++ === 0 ? '話します' : 'はなします');
    answers.rewrite = () => {
      throw new AiError('safeguards flagged this message');
    };
    await api('PUT', '/api/settings', { wkLevel: 1 });
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.deepEqual(calls.map((c) => c.kind), ['chat', 'rewrite', 'chat']);
    assert.equal(res.body.messages[0].content, 'はなします');
  });

  test('if nothing comes back clean, the reply with the fewest problems is kept', async () => {
    let n = 0;
    answers.chat = () => (n++ === 0 ? '話して待つ' : '話す');
    answers.rewrite = () => '話して待つよ';
    await api('PUT', '/api/settings', { wkLevel: 1 });
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.equal(calls.length, 3);
    assert.equal(res.body.messages[0].content, '話す');
  });

  test('a romaji reading is sent back for a rewrite', async () => {
    await api('PUT', '/api/settings', { wkLevel: 60 });
    answers.chat = () => '{待|machi}っています。';
    answers.rewrite = () => '{待|ま}っています。';
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.match(calls[1].request.turns[0].content, /broken furigana markup: \{待\|machi\}/);
    assert.equal(res.body.messages[0].content, '{待|ま}っています。');
  });

  test('every problem goes into the one rewrite request', async () => {
    await api('PUT', '/api/settings', { wkLevel: 1 });
    answers.chat = () => '話します。{待|machi}って。Let me redo this.';
    answers.rewrite = () => 'はなします。まって。';
    const chat = await newChat();
    const res = await reply(chat.id);
    assert.equal(calls.length, 2);
    const ask = calls[1].request.turns[0].content;
    assert.match(ask, /does not know: 話 待/);
    assert.match(ask, /broken furigana/);
    assert.match(ask, /English, romaji or a note/);
    assert.equal(res.body.messages[0].content, 'はなします。まって。');
  });

  test('breakdowns and feedback lose furigana on kana-only words too', async () => {
    await api('PUT', '/api/settings', { wkLevel: 60 });
    const chat = await newChat();
    await reply(chat.id);
    const sent = await send(chat.id, 'コーヒー');
    const [partner, mine] = sent.body.messages;
    answers.breakdown = () => ({ lines: [{ japanese: '{コーヒー|こーひー}を{飲|の}む', translation: 't', explanation: 'e', words: [{ text: '{コーヒー|coffee}', reading: 'こーひー', meaning: 'coffee' }] }] });
    answers.feedback = () => ({ meaning: 'm', verdict: 'minor', corrected: '{コーヒー|こーひー}をください', summary: 's', lines: [{ original: 'コーヒー', corrected: '{コーヒー|こーひー}をください', translation: 't', explanation: 'e', ok: false }] });
    const b = (await analyze(chat.id, partner.id)).body.breakdown!;
    assert.equal(b.lines[0].japanese, 'コーヒーを{飲|の}む');
    assert.equal(b.lines[0].words[0].text, 'コーヒー');
    const f = (await analyze(chat.id, mine.id)).body.feedback!;
    assert.equal(f.corrected, 'コーヒーをください');
    assert.equal(f.lines[0].corrected, 'コーヒーをください');
  });
});

describe('test model', () => {
  test('sends a short test message to the unsaved choice and returns the reply and time', async () => {
    await api('PUT', '/api/settings', { provider: 'endpoint', endpoint: { model: 'saved-model' } });
    answers.chat = () => '  Test received!  ';
    const res = await api('POST', '/api/test-model', { provider: 'claude', claude: { model: 'claude-haiku-5-5' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.reply, 'Test received!');
    assert.equal(typeof res.body.ms, 'number');
    assert.equal(calls.length, 1);
    assert.match(calls[0].request.system, /connection test/);
    assert.match(calls[0].request.turns[0].content, /test message/);
    assert.equal(calls[0].settings.provider, 'claude');
    assert.equal(calls[0].settings.claude.model, 'claude-haiku-5-5');
    assert.equal(calls[0].settings.claude.command, 'claude', 'unsent fields come from the saved settings');
    assert.equal((await api<Settings>('GET', '/api/settings')).body.provider, 'endpoint', 'nothing is saved');
  });

  test('a bad provider falls back to the saved one', async () => {
    await api('PUT', '/api/settings', { provider: 'endpoint' });
    await api('POST', '/api/test-model', { provider: 'nonsense' });
    assert.equal(calls[0].settings.provider, 'endpoint');
  });

  test('a model that fails is a 502 with its message', async () => {
    answers.chat = () => {
      throw new AiError('could not reach http://localhost:1234/v1');
    };
    const res = await api('POST', '/api/test-model', {});
    assert.equal(res.status, 502);
    assert.match(res.body.error, /could not reach/);
  });
});

describe('speech style per chat', () => {
  test('a new chat takes the style it is given, polite by default, and ignores junk', async () => {
    assert.equal((await api<Chat>('POST', '/api/chats', { topic: '', politeness: 'casual' })).body.politeness, 'casual');
    assert.equal((await newChat()).politeness, 'polite');
    assert.equal((await api<Chat>('POST', '/api/chats', { politeness: 'rude' })).body.politeness, 'polite');
  });

  test('the reply uses the chat\'s style, and changing it applies to the next reply', async () => {
    const chat = (await api<Chat>('POST', '/api/chats', { topic: '', politeness: 'casual' })).body;
    const titled = (await reply(chat.id)).body;
    assert.match(calls[0].request.system, /casual plain form/);
    const patched = await api<Chat>('PATCH', `/api/chats/${chat.id}`, { politeness: 'polite' });
    assert.equal(patched.body.politeness, 'polite');
    assert.equal(patched.body.title, titled.title, 'changing the style leaves the title alone');
    calls.length = 0;
    await send(chat.id, 'はい');
    await reply(chat.id);
    assert.match(calls[0].request.system, /polite です\/ます form/);
  });

  test('feedback follows the chat\'s style', async () => {
    const chat = (await api<Chat>('POST', '/api/chats', { topic: '', politeness: 'casual' })).body;
    await reply(chat.id);
    const sent = await send(chat.id, 'げんき');
    calls.length = 0;
    await analyze(chat.id, sent.body.messages[1].id);
    assert.match(calls[0].request.system, /The chat is in casual plain form/);
  });

  test('a rename leaves the style alone', async () => {
    const chat = (await api<Chat>('POST', '/api/chats', { topic: 'x', politeness: 'casual' })).body;
    const renamed = await api<Chat>('PATCH', `/api/chats/${chat.id}`, { title: 'New' });
    assert.equal(renamed.body.politeness, 'casual');
    assert.equal(renamed.body.title, 'New');
  });
});

describe('Genki lesson in the prompts', () => {
  test('the saved Genki lesson reaches the conversation prompt', async () => {
    await api('PUT', '/api/settings', { genkiLesson: 5 });
    const chat = await newChat();
    await reply(chat.id);
    assert.match(calls[0].request.system, /covered lessons 1-5/);
    await api('PUT', '/api/settings', { genkiLesson: 0 });
  });
});

describe('chat settings', () => {
  test('the topic can be changed, and cleared, and the next reply uses it', async () => {
    const chat = await newChat('Café');
    await reply(chat.id);
    assert.equal((await api<Chat>('PATCH', `/api/chats/${chat.id}`, { topic: '  At the station ' })).body.topic, 'At the station');
    calls.length = 0;
    await send(chat.id, 'はい');
    await reply(chat.id);
    assert.match(calls[0].request.system, /chosen by the learner: At the station\./);
    assert.equal((await api<Chat>('PATCH', `/api/chats/${chat.id}`, { topic: '' })).body.topic, '');
    assert.equal((await api<Chat>('PATCH', `/api/chats/${chat.id}`, { politeness: 'casual' })).body.topic, '', 'other changes leave it alone');
  });
});

describe('message context', () => {
  const CLAUDE = { provider: 'claude', claude: { model: 'claude-opus-5-5', effort: 'high' } };
  const resetSettings = () => api('PUT', '/api/settings', { provider: 'endpoint', endpoint: { model: '' }, claude: { model: 'claude-sonnet-5-5', effort: '' }, genkiLesson: 0, jlptLevel: 0 });

  test('each message is stamped with the model, effort, style and levels it was written under', async () => {
    await api('PUT', '/api/settings', { ...CLAUDE, wkLevel: 12, genkiLesson: 6, jlptLevel: 4 });
    const chat = (await api<Chat>('POST', '/api/chats', { topic: '', politeness: 'casual' })).body;
    await reply(chat.id);
    const sent = (await send(chat.id, 'うん')).body;
    const expected = { provider: 'claude', model: 'claude-opus-5-5', effort: 'high', politeness: 'casual', wkLevel: 12, genkiLesson: 6, jlptLevel: 4 };
    assert.deepEqual(sent.messages[0].context, expected);
    assert.deepEqual(sent.messages[1].context, expected);
    await resetSettings();
  });

  test('an endpoint has no effort, and the Claude default model is written out', async () => {
    await api('PUT', '/api/settings', { provider: 'endpoint', endpoint: { model: 'qwen3' } });
    const a = await newChat();
    const ctx = (await reply(a.id)).body.messages[0].context!;
    assert.equal(ctx.model, 'qwen3');
    assert.ok(!('effort' in ctx));
    await api('PUT', '/api/settings', { provider: 'claude', claude: { model: '', effort: '' } });
    const b = await newChat();
    assert.equal((await reply(b.id)).body.messages[0].context!.model, 'claude-sonnet-5-5');
    await resetSettings();
  });

  test('a breakdown after the settings changed uses the message\'s model and levels, not the new ones', async () => {
    await api('PUT', '/api/settings', { ...CLAUDE, wkLevel: 12, genkiLesson: 6 });
    const chat = await newChat();
    const mid = (await reply(chat.id)).body.messages[0].id;
    await api('PUT', '/api/settings', { provider: 'endpoint', endpoint: { model: 'qwen3' }, wkLevel: 3, genkiLesson: 2 });
    calls.length = 0;
    await analyze(chat.id, mid);
    const used = calls[0].settings;
    assert.deepEqual([used.provider, used.claude.model, used.claude.effort, used.wkLevel, used.genkiLesson], ['claude', 'claude-opus-5-5', 'high', 12, 6]);
    assert.match(calls[0].request.system, /The learner studies with Genki/);
    await resetSettings();
  });

  test('feedback after the style changed uses the style the message was sent in', async () => {
    const chat = (await api<Chat>('POST', '/api/chats', { topic: '', politeness: 'casual' })).body;
    await reply(chat.id);
    const mid = (await send(chat.id, 'げんき')).body.messages[1].id;
    await api('PATCH', `/api/chats/${chat.id}`, { politeness: 'polite' });
    calls.length = 0;
    await analyze(chat.id, mid);
    assert.match(calls[0].request.system, /The chat is in casual plain form/);
  });

  test('connection details stay current: a stamped endpoint model goes to today\'s URL', async () => {
    await api('PUT', '/api/settings', { provider: 'endpoint', endpoint: { baseUrl: 'http://old:1/v1', model: 'qwen3' } });
    const chat = await newChat();
    const mid = (await reply(chat.id)).body.messages[0].id;
    await api('PUT', '/api/settings', { endpoint: { baseUrl: 'http://new:1/v1', model: 'gemma' } });
    calls.length = 0;
    await analyze(chat.id, mid);
    assert.deepEqual([calls[0].settings.endpoint.baseUrl, calls[0].settings.endpoint.model], ['http://new:1/v1', 'qwen3']);
    await api('PUT', '/api/settings', { endpoint: { baseUrl: 'http://localhost:1234/v1' } });
    await resetSettings();
  });

  test('messages from before stamping are analysed with the current settings and the chat\'s style', async () => {
    const chat = (await api<Chat>('POST', '/api/chats', { topic: '', politeness: 'casual' })).body;
    await reply(chat.id);
    const sent = (await send(chat.id, 'げんき')).body;
    const { saveChat } = await import('../../server/store.ts');
    await saveChat({ ...sent, messages: sent.messages.map(({ context: _, ...m }) => m) });
    await api('PUT', '/api/settings', { wkLevel: 9 });
    calls.length = 0;
    await analyze(chat.id, sent.messages[1].id);
    assert.equal(calls[0].settings.wkLevel, 9);
    assert.match(calls[0].request.system, /The chat is in casual plain form/);
  });
});

describe('rewind', () => {
  const rewind = (id: string, mid: string) => api<Chat>('POST', `/api/chats/${id}/messages/${mid}/rewind`);

  async function conversation() {
    const chat = await newChat();
    await reply(chat.id);
    await send(chat.id, 'one');
    await reply(chat.id);
    await send(chat.id, 'two');
    return (await reply(chat.id)).body;
  }

  test('deletes the learner\'s message and everything after it', async () => {
    const chat = await conversation();
    assert.equal(chat.messages.length, 5);
    const res = await rewind(chat.id, chat.messages[1].id);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.messages.map((m) => m.id), [chat.messages[0].id]);
    assert.deepEqual((await api<Chat>('GET', `/api/chats/${chat.id}`)).body.messages.length, 1);
  });

  test('rewinding to the last message removes just that one', async () => {
    const chat = await newChat();
    await reply(chat.id);
    const sent = (await send(chat.id, 'hi')).body;
    assert.equal((await rewind(chat.id, sent.messages[1].id)).body.messages.length, 1);
  });

  test('the partner\'s messages can\'t be rewound to, and unknown ones are 404s', async () => {
    const chat = await conversation();
    const bad = await api<{ error: string }>('POST', `/api/chats/${chat.id}/messages/${chat.messages[2].id}/rewind`);
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /only the learner's messages/);
    assert.equal((await rewind(chat.id, 'nope')).status, 404);
    assert.equal((await api<Chat>('GET', `/api/chats/${chat.id}`)).body.messages.length, 5, 'nothing deleted');
  });

  test('a reply that finishes after a rewind is dropped, not added to the new history', async () => {
    const chat = await newChat();
    await reply(chat.id);
    const sent = (await send(chat.id, 'hi')).body;
    let finish!: () => void;
    answers.chat = () => new Promise((r) => (finish = () => r('おそい')));
    const late = reply(chat.id);
    await new Promise((r) => setTimeout(r, 20));
    await rewind(chat.id, sent.messages[1].id);
    finish();
    const res = await late;
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.messages.map((m) => m.content), [sent.messages[0].content]);
  });

  test('an analysis that finishes after its message was rewound is a 404 and saves nothing', async () => {
    const chat = await newChat();
    await reply(chat.id);
    const sent = (await send(chat.id, 'hi')).body;
    let finish!: () => void;
    answers.feedback = () => new Promise((r) => (finish = () => r(DEFAULT_ANSWERS.feedback({} as AiRequest))));
    const late = analyze(chat.id, sent.messages[1].id);
    await new Promise((r) => setTimeout(r, 20));
    await rewind(chat.id, sent.messages[1].id);
    finish();
    assert.equal((await late).status, 404);
    assert.equal((await api<Chat>('GET', `/api/chats/${chat.id}`)).body.messages.length, 1);
  });
});
