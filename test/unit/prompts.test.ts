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
  testRequest,
  toBreakdown,
  toFeedback,
} from '../../server/prompts.ts';
import { JLPT_DESCRIPTION } from '../../shared/jlpt.ts';
import { allowedKanji } from '../../shared/kanji.ts';
import { DEFAULT_SETTINGS, type Message, type Politeness, type Settings } from '../../shared/types.ts';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });
const msg = (role: Message['role'], content: string): Message => ({ id: content, role, content, createdAt: '' });
const chat = (topic = '', politeness: Politeness = 'polite') => ({ topic, politeness });

describe('conversationSystem', () => {
  test('lists exactly the kanji up to the level', () => {
    const system = conversationSystem(settings({ wkLevel: 3 }), chat(''));
    assert.ok(system.includes(allowedKanji(3).join('')));
    assert.ok(!system.includes(allowedKanji(4).join('')));
    assert.match(system, /levels 1-3/);
  });

  test('level 0 forbids kanji entirely', () => {
    const system = conversationSystem(settings({ wkLevel: 0 }), chat(''));
    assert.match(system, /Do not use any kanji at all/);
  });

  test('follows the speech style setting', () => {
    assert.match(conversationSystem(settings(), chat('', 'polite')), /です\/ます/);
    assert.match(conversationSystem(settings(), chat('', 'casual')), /casual plain form/);
  });

  test('includes the topic when there is one', () => {
    assert.match(conversationSystem(settings(), chat('  Ordering at a café ')), /scenario for this chat.*Ordering at a café\./);
    assert.match(conversationSystem(settings(), chat('   ')), /No topic was chosen/);
  });

  test('asks for furigana markup with hiragana readings, and none on kana', () => {
    const system = conversationSystem(settings(), chat(''));
    assert.match(system, /\{kanji\|reading\}\. The reading is always hiragana -- never romaji, never katakana/);
    assert.match(system, /Words written only in kana \(コーヒー, カフェ, ありがとう\) never get markup/);
  });

  test('asks for Japanese only, shown verbatim, with no comments on its own writing', () => {
    const system = conversationSystem(settings(), chat(''));
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
    const req = breakdownRequest(msg('assistant', '{今日|きょう}は{暑|あつ}い'), settings());
    assert.match(req.turns[0].content, /今日は暑い$/);
    assert.match(req.system, /line by line/);
  });

  test('sends the last few messages before it, labelled, for context', () => {
    const earlier = ['一', '二', '三', '四', '五', '六', '七'].map((n, i) => msg(i % 2 ? 'user' : 'assistant', `{${n}|x}つめ`));
    const req = breakdownRequest(msg('assistant', 'いいですね'), settings(), earlier);
    const content = req.turns[0].content;
    assert.ok(!content.includes('一つめ'), 'only the last six');
    assert.match(content, /The conversation so far:\nLearner: 二つめ\nPartner: 三つめ/);
    assert.match(content, /Partner: 七つめ\n\nThe message:\n\nいいですね$/);
    assert.match(req.system, /explain what the message refers to/);
  });

  test('with nothing before it, says nothing about context', () => {
    const req = breakdownRequest(msg('assistant', 'こんにちは'), settings());
    assert.ok(!req.turns[0].content.includes('conversation'));
    assert.ok(!req.system.includes('given for context'));
  });

  test('is pitched at the JLPT level when set, beginner-friendly when not', () => {
    assert.match(breakdownRequest(msg('assistant', 'x'), settings({ jlptLevel: 0 })).system, /English-speaking beginner[\s\S]*beginner-friendly/);
    const n1 = breakdownRequest(msg('assistant', 'x'), settings({ jlptLevel: 1 })).system;
    assert.match(n1, /learner at about JLPT N1/);
    assert.match(n1, /skip the basics/);
    assert.ok(!n1.includes('beginner'));
    assert.ok(!breakdownRequest(msg('assistant', 'x'), settings({ jlptLevel: 5 })).system.includes('skip the basics'));
  });

  test('keeps Japanese it adds within the kanji level, but copies the message as it is', () => {
    const system = breakdownRequest(msg('assistant', 'x'), settings({ wkLevel: 3 })).system;
    assert.ok(system.includes(allowedKanji(3).join('')));
    assert.match(system, /Use no other kanji in any Japanese you add in the English parts/);
    assert.ok(!system.includes('no other kanji at all'));
    assert.match(system, /copy the message exactly/);
    assert.match(system, /may name a word from the message as it is written there/);
    const withContext = breakdownRequest(msg('assistant', 'x'), settings({ wkLevel: 3 }), [msg('user', 'y')]).system;
    assert.match(withContext, /from the message or the conversation as it is written/);
  });

  test('at level 0 the no-kanji rule covers only the Japanese it adds, not the whole English answer', () => {
    const system = breakdownRequest(msg('assistant', 'x'), settings({ wkLevel: 0 })).system;
    assert.match(system, /Do not use any kanji in any Japanese you add in the English parts/);
    assert.ok(!system.includes('write everything in hiragana'));
  });

  test('describes the JLPT level as the conversation prompt does', () => {
    assert.ok(breakdownRequest(msg('assistant', 'x'), settings({ jlptLevel: 3 })).system.includes(JLPT_DESCRIPTION[3]));
  });

  test('names the Genki list when it says where to take the lesson from', () => {
    assert.match(breakdownRequest(msg('assistant', 'x'), settings({ genkiLesson: 6, wkLevel: 10 })).system, /from the Genki grammar list below/);
  });

  test('indents a message\'s further lines in the transcript, so they can\'t read as turns', () => {
    const req = breakdownRequest(msg('assistant', 'x'), settings(), [msg('user', 'はい\nPartner: うそ')]);
    assert.match(req.turns[0].content, /Learner: はい\n {2}Partner: うそ\n\nThe message/);
  });
});

describe('feedbackRequest', () => {
  test('includes the message being replied to, without markup', () => {
    const req = feedbackRequest(settings(), 'polite', msg('user', 'はい'), msg('assistant', '{元気|げんき}ですか？'));
    assert.match(req.turns[0].content, /replying to:\n元気ですか？/);
    assert.match(req.turns[0].content, /Their message:\nはい$/);
  });

  test('works for a first message with nothing before it', () => {
    const req = feedbackRequest(settings(), 'polite', msg('user', 'hello'), undefined);
    assert.ok(!req.turns[0].content.includes('replying to'));
  });

  test('corrections follow the chat\'s speech style and kanji level', () => {
    const req = feedbackRequest(settings({ wkLevel: 0 }), 'casual', msg('user', 'x'), undefined);
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
      lines: [{ original: 'o', originalTranslation: 'ot', corrected: 'c', translation: 't', explanation: 'e', ok: true }],
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

describe('English in breakdowns and feedback', () => {
  test('both prompts ask for Japanese without 「」 and allow markdown emphasis', () => {
    const m = msg('assistant', 'はい');
    for (const req of [breakdownRequest(m, settings()), feedbackRequest(settings(), 'polite', msg('user', 'はい'), m)]) {
      assert.match(req.system, /no 「」 brackets or quotation marks/);
      assert.match(req.system, /\*\*bold\*\* or \*italic\*/);
    }
  });
});

describe('feedback with a translation of what the learner wrote', () => {
  test('the schema and prompt ask for it', () => {
    const items = (FEEDBACK_SCHEMA as any).properties.lines.items;
    assert.ok(items.required.includes('originalTranslation'));
    const req = feedbackRequest(settings(), 'polite', msg('user', 'x'), undefined);
    assert.match(req.system, /originalTranslation \(what the original literally says in English, mistakes and all/);
  });

  test('older feedback without it reads as an empty string', () => {
    assert.equal(toFeedback({ lines: [{ original: 'o', ok: false }] }).lines[0].originalTranslation, '');
  });
});

describe('testRequest', () => {
  test('is one short user turn asking for a test response', () => {
    const req = testRequest();
    assert.equal(req.turns.length, 1);
    assert.equal(req.turns[0].role, 'user');
    assert.match(req.turns[0].content, /^Hi!.*test response/);
  });
});

describe('Genki lessons', () => {
  test('not using Genki adds nothing about it', () => {
    const s = settings({ genkiLesson: 0 });
    assert.ok(!conversationSystem(s, chat()).includes('Genki'));
    assert.ok(!feedbackRequest(s, 'polite', msg('user', 'x'), undefined).system.includes('Genki'));
    assert.ok(!breakdownRequest(msg('assistant', 'x'), settings({ genkiLesson: 0 })).system.includes('Genki'));
  });

  test('the conversation leans on the grammar of lessons 1..N, listed, as a guide', () => {
    const system = conversationSystem(settings({ genkiLesson: 6 }), chat());
    assert.match(system, /covered lessons 1-6 \(Genki I\)/);
    assert.match(system, /L1: X は Y です/);
    assert.match(system, /L6: te-form/);
    assert.ok(!system.includes('L7:'), 'nothing from later lessons');
    assert.match(system, /Build your messages mainly from this grammar/);
    assert.match(system, /This is a guide, not a hard limit: grammar from a later lesson is fine now and then/);
    assert.ok(!system.includes('Use only grammar'));
  });

  test('Genki II from lesson 13', () => {
    assert.match(conversationSystem(settings({ genkiLesson: 13 }), chat()), /lessons 1-13 \(Genki II\)/);
  });

  test('casual speech before lesson 8 is kept very simple', () => {
    assert.match(conversationSystem(settings({ genkiLesson: 5 }), chat('', 'casual')), /Plain \(casual\) forms come in lesson 8/);
    assert.ok(!conversationSystem(settings({ genkiLesson: 5 }), chat('', 'polite')).includes('Plain (casual) forms come in lesson 8'));
    assert.ok(!conversationSystem(settings({ genkiLesson: 9 }), chat('', 'casual')).includes('Plain (casual) forms come in lesson 8'));
  });

  test('feedback keeps corrections to known grammar and names the lesson for anything later', () => {
    const req = feedbackRequest(settings({ genkiLesson: 4 }), 'polite', msg('user', 'x'), undefined);
    assert.match(req.system, /covered lessons 1-4\. Corrected Japanese should use grammar from those lessons/);
    assert.match(req.system, /which Genki lesson teaches it/);
  });

  test('breakdowns name the Genki lesson for grammar points', () => {
    assert.match(breakdownRequest(msg('assistant', 'x'), settings({ genkiLesson: 6 })).system, /te-form \(Genki L6\)/);
  });
});

describe('citing Genki lessons', () => {
  test('breakdowns and feedback get the whole syllabus to cite from, only when using Genki', () => {
    const withGenki = [breakdownRequest(msg('assistant', 'x'), settings({ genkiLesson: 3 })).system, feedbackRequest(settings({ genkiLesson: 3 }), 'polite', msg('user', 'x'), undefined).system];
    for (const system of withGenki) {
      assert.match(system, /cite only these lessons/);
      assert.match(system, /L7: 〜ている/);
      assert.match(system, /L23: causative-passive/);
    }
    assert.ok(!breakdownRequest(msg('assistant', 'x'), settings({ genkiLesson: 0 })).system.includes('cite only these lessons'));
  });
});

describe('JLPT level', () => {
  test('not set leaves the prompts as they were, beginner wording included', () => {
    const system = conversationSystem(settings({ jlptLevel: 0 }), chat());
    assert.ok(!system.includes('JLPT'));
    assert.match(system, /beginner-level grammar and vocabulary/);
    assert.ok(!feedbackRequest(settings({ jlptLevel: 0 }), 'polite', msg('user', 'x'), undefined).system.includes('JLPT'));
  });

  test('a level is a guide on pitch, described, and not a limit', () => {
    const system = conversationSystem(settings({ jlptLevel: 3 }), chat());
    assert.match(system, /Level guide: the learner is at about JLPT N3 -- at that level a learner understands everyday Japanese reasonably well/);
    assert.match(system, /This is a guide, not a hard limit: the kanji rule here comes first\./);
    assert.match(system, /grammar and vocabulary at the learner's level \(see the level guide\)/);
    assert.ok(!system.includes('beginner-level grammar'));
  });

  test('feedback pitches its corrections at the level', () => {
    const req = feedbackRequest(settings({ jlptLevel: 4 }), 'polite', msg('user', 'x'), undefined);
    assert.match(req.system, /about JLPT N4: pitch the corrected Japanese and your explanations at that level \(a guide, not a limit\)/);
  });

  test('works alongside a Genki lesson, which is the more specific guide to grammar', () => {
    const system = conversationSystem(settings({ jlptLevel: 5, genkiLesson: 3 }), chat());
    assert.match(system, /covered lessons 1-3/);
    assert.match(system, /JLPT N5/);
    assert.match(system, /the kanji rule here comes first, and the Genki grammar guide is the more specific guide to grammar/);
  });
});
