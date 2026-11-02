import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  BREAKDOWN_SCHEMA,
  breakdownRequest,
  conversationSystem,
  conversationTurns,
  FEEDBACK_SCHEMA,
  feedbackRequest,
  rewriteRequest,
  toBreakdown,
  toFeedback,
} from '../../server/prompts.ts';
import { allowedKanji } from '../../shared/kanji.ts';
import { DEFAULT_SETTINGS, type Message, type Settings } from '../../shared/types.ts';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });
const msg = (role: Message['role'], content: string): Message => ({ id: content, role, content, createdAt: '' });

describe('conversationSystem', () => {
  test('lists exactly the kanji up to the level', () => {
    const system = conversationSystem(settings({ wkLevel: 3 }), '');
    assert.ok(system.includes(allowedKanji(3).join('')));
    assert.ok(!system.includes(allowedKanji(4).join('')));
    assert.match(system, /levels 1-3/);
  });

  test('level 0 forbids kanji entirely', () => {
    const system = conversationSystem(settings({ wkLevel: 0 }), '');
    assert.match(system, /Do not use any kanji at all/);
  });

  test('follows the speech style setting', () => {
    assert.match(conversationSystem(settings({ politeness: 'polite' }), ''), /です\/ます/);
    assert.match(conversationSystem(settings({ politeness: 'casual' }), ''), /casual plain form/);
  });

  test('includes the topic when there is one', () => {
    assert.match(conversationSystem(settings(), '  Ordering at a café '), /scenario for this chat.*Ordering at a café\./);
    assert.match(conversationSystem(settings(), '   '), /No topic was chosen/);
  });

  test('asks for furigana markup with hiragana readings, and none on kana', () => {
    const system = conversationSystem(settings(), '');
    assert.match(system, /\{kanji\|reading\}\. The reading is always hiragana -- never romaji, never katakana/);
    assert.match(system, /Words written only in kana \(コーヒー, カフェ, ありがとう\) never get markup/);
  });

  test('asks for Japanese only, shown verbatim, with no comments on its own writing', () => {
    const system = conversationSystem(settings(), '');
    assert.match(system, /Write only in Japanese/);
    assert.match(system, /shown to the learner exactly as written/);
    assert.match(system, /Never comment on your own writing/);
  });
});

describe('conversationTurns', () => {
  test('an empty chat becomes a single cue asking for the opener', () => {
    const turns = conversationTurns([]);
    assert.equal(turns.length, 1);
    assert.equal(turns[0].role, 'user');
    assert.match(turns[0].content, /Start the conversation/);
  });

  test('a history that starts with the partner gets the cue first', () => {
    const turns = conversationTurns([msg('assistant', 'こんにちは'), msg('user', 'やあ')]);
    assert.deepEqual(turns.map((t) => t.role), ['user', 'assistant', 'user']);
    assert.equal(turns[2].content, 'やあ');
  });

  test('a history that starts with the learner is left as is', () => {
    assert.equal(conversationTurns([msg('user', 'やあ')]).length, 1);
  });

  test('drops breakdowns and feedback from what is sent', () => {
    const m = { ...msg('assistant', 'x'), breakdown: { lines: [] } };
    assert.deepEqual(Object.keys(conversationTurns([m])[1]).sort(), ['content', 'role']);
  });
});

describe('rewriteRequest', () => {
  const none = { kanji: [], furigana: [], foreign: [] };

  test('names the kanji to remove and includes the text', () => {
    const req = rewriteRequest(settings({ wkLevel: 2 }), '{日本|にほん}が{好|す}き', { ...none, kanji: ['好'] });
    assert.match(req.turns[0].content, /kanji the learner does not know: 好/);
    assert.match(req.turns[0].content, /\{日本\|にほん\}が\{好\|す\}き$/);
    assert.match(req.system, /levels 1-2/);
    assert.match(req.system, /^You edit Japanese/, 'the UI mock routes on this opening');
  });

  test('lists only the problems there are', () => {
    const req = rewriteRequest(settings(), 'x', { ...none, furigana: ['{待|machi}'] });
    assert.match(req.turns[0].content, /broken furigana markup: \{待\|machi\}/);
    assert.ok(!req.turns[0].content.includes('kanji the learner does not know'));
    assert.ok(!req.turns[0].content.includes('English'));
  });

  test('asks for leaked English or notes to be removed, keeping a corrected version', () => {
    const req = rewriteRequest(settings(), 'x', { ...none, foreign: ['Let me redo this.'] });
    assert.match(req.turns[0].content, /English, romaji or a note .*"Let me redo this\."/);
    assert.match(req.turns[0].content, /keep the corrected version/);
  });
});

describe('breakdownRequest', () => {
  test('sends the message without furigana markup', () => {
    const req = breakdownRequest(settings(), msg('assistant', '{今日|きょう}は{暑|あつ}い'));
    assert.match(req.turns[0].content, /今日は暑い$/);
    assert.match(req.system, /line by line/);
  });
});

describe('feedbackRequest', () => {
  test('includes the message being replied to, without markup', () => {
    const req = feedbackRequest(settings(), msg('user', 'はい'), msg('assistant', '{元気|げんき}ですか？'));
    assert.match(req.turns[0].content, /replying to:\n元気ですか？/);
    assert.match(req.turns[0].content, /Their message:\nはい$/);
  });

  test('works for a first message with nothing before it', () => {
    const req = feedbackRequest(settings(), msg('user', 'hello'), undefined);
    assert.ok(!req.turns[0].content.includes('replying to'));
  });

  test('corrections follow the chat\'s speech style and kanji level', () => {
    const req = feedbackRequest(settings({ politeness: 'casual', wkLevel: 0 }), msg('user', 'x'), undefined);
    assert.match(req.system, /casual plain form/);
    assert.match(req.system, /Do not use any kanji/);
  });
});

/** OpenAI strict mode needs every object closed and every property required. */
function assertStrict(schema: any, at = 'root') {
  if (schema.type === 'object') {
    assert.equal(schema.additionalProperties, false, `${at}: additionalProperties`);
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), `${at}: required`);
    for (const [k, v] of Object.entries(schema.properties)) assertStrict(v, `${at}.${k}`);
  }
  if (schema.type === 'array') assertStrict(schema.items, `${at}[]`);
}

describe('answer schemas', () => {
  test('are valid for strict structured output', () => {
    assertStrict(BREAKDOWN_SCHEMA);
    assertStrict(FEEDBACK_SCHEMA);
  });

  test('feedback verdicts match what the UI knows', () => {
    assert.deepEqual((FEEDBACK_SCHEMA as any).properties.verdict.enum, ['correct', 'minor', 'incorrect', 'english']);
  });
});

describe('toBreakdown', () => {
  test('keeps a well-formed answer', () => {
    const raw = { lines: [{ japanese: 'あ', translation: 'a', explanation: 'e', words: [{ text: 'あ', reading: 'あ', meaning: 'a' }] }] };
    assert.deepEqual(toBreakdown(raw), raw);
  });

  test('fills in missing fields and drops junk entries', () => {
    assert.deepEqual(toBreakdown({ lines: [{ japanese: 'あ' }, 'junk', null] }), {
      lines: [{ japanese: 'あ', translation: '', explanation: '', words: [] }],
    });
  });

  test('decodes a list sent as a JSON string', () => {
    const out = toBreakdown({ lines: JSON.stringify([{ japanese: 'い', translation: 'i', explanation: '', words: '[]' }]) });
    assert.equal(out.lines[0].japanese, 'い');
    assert.deepEqual(out.lines[0].words, []);
  });

  test('survives nothing at all', () => {
    assert.deepEqual(toBreakdown(null), { lines: [] });
    assert.deepEqual(toBreakdown({ lines: 'not json' }), { lines: [] });
  });

  test('turns numbers into strings', () => {
    assert.equal(toBreakdown({ lines: [{ japanese: 3 }] }).lines[0].japanese, '3');
  });
});

describe('toFeedback', () => {
  test('keeps a well-formed answer', () => {
    const raw = {
      meaning: 'm',
      verdict: 'correct',
      corrected: 'c',
      summary: 's',
      lines: [{ original: 'o', corrected: 'c', translation: 't', explanation: 'e', ok: true }],
    };
    assert.deepEqual(toFeedback(raw), raw);
  });

  test('an unknown verdict becomes "minor"', () => {
    assert.equal(toFeedback({ verdict: 'great' }).verdict, 'minor');
    assert.equal(toFeedback({}).verdict, 'minor');
  });

  test('ok is true only when it says so', () => {
    const out = toFeedback({ lines: [{ ok: 'true' }, { ok: 1 }, { ok: true }] });
    assert.deepEqual(out.lines.map((l) => l.ok), [false, false, true]);
  });
});
