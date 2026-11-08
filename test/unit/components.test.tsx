// Components rendered to static HTML: checks markup without a browser. The
// interactive behaviour is covered by the Playwright tests in test/ui.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SETTINGS, needsModel, type Breakdown, type Chat, type ChatSummary, type Feedback, type Message, type MessageContext, type Settings } from '../../shared/types.ts';
import { BreakdownView, FeedbackView, glossSegments } from '../../src/components/Analysis.tsx';
import { ChatSettingsDialog } from '../../src/components/ChatSettingsDialog.tsx';
import { Composer } from '../../src/components/Composer.tsx';
import { ConfirmDialog } from '../../src/components/Dialog.tsx';
import { ContextLine } from '../../src/components/ContextLine.tsx';
import { MessageBubble } from '../../src/components/MessageBubble.tsx';
import { ContextDetails } from '../../src/components/MessageInfo.tsx';
import { JpText, KnownKanjiProvider } from '../../src/components/JpText.tsx';
import { parseInline } from '../../src/components/RichText.tsx';
import { LanguageProvider, STRINGS } from '../../src/i18n.tsx';
import { SettingsContext } from '../../src/settings.tsx';
import { SettingsDialog } from '../../src/components/SettingsDialog.tsx';
import { SetupNotice } from '../../src/components/SetupNotice.tsx';
import { Sidebar } from '../../src/components/Sidebar.tsx';

function render(node: ReactNode, patch: Partial<Settings> = {}): string {
  const settings = { ...DEFAULT_SETTINGS, ...patch };
  return renderToStaticMarkup(
    <SettingsContext.Provider value={{ settings, loaded: true, update: async () => {} }}>
      <LanguageProvider language={settings.uiLanguage}>{node}</LanguageProvider>
    </SettingsContext.Provider>,
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('JpText', () => {
  test('renders furigana markup as ruby', () => {
    const html = render(<JpText text="{日本|にほん}へ{行|い}きます" />, { wkLevel: 60 });
    assert.equal(count(html, '<ruby>'), 2);
    assert.match(html, /<rt>にほん<\/rt>/);
    assert.match(html, /<rt>い<\/rt>/);
    assert.ok(html.includes('へ'));
  });

  test('a word marked a kanji at a time is one ruby, so its kanji stay together', () => {
    const html = render(<JpText text="{今|こん}{週|しゅう}の{週|しゅう}{末|まつ}" />, { wkLevel: 60 });
    assert.equal(count(html, '<ruby>'), 2);
    assert.match(html, /<rt>こんしゅう<\/rt>/);
    assert.match(html, /<rt>しゅうまつ<\/rt>/);
  });

  test('drops the readings when furigana is off', () => {
    const html = render(<JpText text="{日本|にほん}へ" />, { wkLevel: 60, furigana: false });
    assert.equal(count(html, '<ruby>'), 0);
    assert.ok(!html.includes('にほん'));
    assert.ok(html.includes('日') && html.includes('本'));
  });

  test('marks kanji above the level, and only those', () => {
    // 人 is level 1, 語 is level 5+
    const html = render(<JpText text="人と語" />, { wkLevel: 1 });
    assert.equal(count(html, 'over-level'), 1);
    assert.match(html, /class="kanji over-level" title="Above your WaniKani level[^"]*">語</);
    assert.match(html, /class="kanji" title="人 — [^"]*WaniKani level 1[^"]*">人</);
  });

  test('a kanji WaniKani does not teach is marked as such', () => {
    const html = render(<JpText text="薔" />, { wkLevel: 60 });
    assert.match(html, /over-level/);
    assert.match(html, /Not taught on WaniKani/);
  });

  test('tooltips follow the UI language', () => {
    assert.match(render(<JpText text="語" />, { wkLevel: 1, uiLanguage: 'ja' }), /WaniKaniのレベル外/);
  });

  test('plain kana and English pass through untouched', () => {
    assert.equal(render(<JpText text="こんにちは hello" />), '<span class="jp">こんにちは hello</span>');
  });

  test('unbalanced braces are left as text', () => {
    assert.ok(render(<JpText text="{日本 だよ" />, { wkLevel: 60 }).includes('{'));
  });
});

const breakdown: Breakdown = {
  lines: [
    {
      japanese: '{何|なに}を{飲|の}みますか？',
      translation: 'What will you drink?',
      explanation: 'を marks the object.',
      words: [
        { text: '{何|なに}', reading: 'なに', meaning: 'what' },
        { text: 'を', reading: 'を', meaning: 'object marker' },
      ],
    },
    { japanese: 'はい', translation: 'Yes', explanation: '', words: [] },
  ],
};

describe('BreakdownView', () => {
  test('one list item per line with translation and explanation', () => {
    const html = render(<BreakdownView breakdown={breakdown} />, { wkLevel: 60 });
    assert.equal(count(html, 'class="analysis-line"'), 2);
    assert.ok(html.includes('What will you drink?'));
    assert.ok(html.includes('を marks the object.'));
    assert.equal(count(html, 'line-explain'), 1, 'an empty explanation is not rendered');
  });

  test('shows each sentence once, its words glossed in place', () => {
    const html = render(<BreakdownView breakdown={breakdown} />, { wkLevel: 60, furigana: false });
    assert.equal(count(html, 'class="gloss"'), 2, 'two glossed words');
    assert.equal(count(html, 'class="gloss-en"'), 2);
    assert.ok(!html.includes('class="line-jp"'), 'no separate copy of the sentence');
  });
});

const feedback: Feedback = {
  meaning: 'A coffee, please.',
  verdict: 'minor',
  corrected: 'コーヒーをお{願|ねが}いします。',
  summary: 'Use を here.',
  lines: [
    {
      original: 'コーヒーがおねがいします。',
      originalTranslation: 'Coffee is a request.',
      corrected: 'コーヒーをお{願|ねが}いします。',
      translation: 'A coffee, please.',
      explanation: 'を, not が.',
      ok: false,
    },
    { original: 'ありがとう。', originalTranslation: 'Thanks.', corrected: 'ありがとう。', translation: 'Thanks.', explanation: '', ok: true },
  ],
};

describe('FeedbackView', () => {
  test('shows the verdict, meaning and natural version', () => {
    const html = render(<FeedbackView feedback={feedback} />, { wkLevel: 60 });
    assert.match(html, /class="verdict verdict-minor">Almost — small fixes</);
    assert.ok(html.includes('A coffee, please.'));
    assert.ok(html.includes('Use を here.'));
  });

  test('a fixed line shows what was written, its English, the better version, its English, then why', () => {
    const html = render(<FeedbackView feedback={feedback} />, { wkLevel: 60 });
    assert.match(
      html,
      /You wrote.*コーヒーがおねがいします。.*Coffee is a request\..*Better.*コーヒーをお.*A coffee, please\..*class="line-explain"><span>を, not が\./s,
    );
    assert.equal(count(html, 'line-fix'), 1);
    assert.equal(count(html, 'line-ok'), 1);
  });

  test('a correct line shows one row, and a missing English line is left out', () => {
    const f: Feedback = { ...feedback, lines: [{ ...feedback.lines[1] }, { ...feedback.lines[0], originalTranslation: '' }] };
    const html = render(<FeedbackView feedback={f} />, { wkLevel: 60 });
    assert.equal(count(html, 'class="fix-row '), 3, 'one row for the correct line, two for the fix');
    assert.match(html, /fix-row-yours"><div class="line-jp"><span class="jp">コーヒーがおねがいします。<\/span><\/div><\/div>/);
  });

  test('labels follow the UI language', () => {
    const html = render(<FeedbackView feedback={feedback} />, { wkLevel: 60, uiLanguage: 'ja' });
    assert.ok(html.includes('おしい！少し直しましょう'));
    assert.ok(html.includes('<dt>訳</dt>'));
  });
});

describe('explanations', () => {
  test('furigana markup inside an explanation is rendered, not shown raw, in the UI font', () => {
    const f: Feedback = {
      ...feedback,
      summary: 'Use {今日|きょう} here.',
      lines: [{ ...feedback.lines[0], explanation: 'You can say {今日|きょう}はしごとがあった.' }],
    };
    const html = render(<FeedbackView feedback={f} />, { wkLevel: 60 });
    assert.ok(!html.includes('{今日|'), html);
    assert.match(html, /<p class="line-explain"><span>You can say <ruby>/);
    assert.match(html, /<p class="feedback-summary"><span>Use <ruby>/);
  });

  test('kanji quoted in commentary are never flagged, even above the level', () => {
    const f: Feedback = { ...feedback, summary: 'I wrote 仕事 as しごと because 事 is not in your list.' };
    const html = render(<FeedbackView feedback={f} />, { wkLevel: 1 });
    const summary = html.match(/<p class="feedback-summary">.*?<\/p>/s)![0];
    assert.equal(count(summary, 'over-level'), 0);
    assert.equal(count(summary, 'class="kanji"'), 3);
  });
});

describe('glossSegments', () => {
  const line = (japanese: string, words: [string, string][], reading = '') => ({
    japanese,
    translation: '',
    explanation: '',
    words: words.map(([text, meaning]) => ({ text, reading, meaning })),
  });
  const texts = (segs: { text: string }[]) => segs.map((s) => s.text);

  test('cuts the sentence into its words, in order', () => {
    const segs = glossSegments(line('{今日|きょう}はなにをするの？', [['{今日|きょう}', 'today'], ['は', 'topic'], ['なに', 'what'], ['を', 'object'], ['する', 'do'], ['の', 'question']]));
    assert.deepEqual(texts(segs), ['{今日|きょう}', 'は', 'なに', 'を', 'する', 'の？']);
    assert.deepEqual(segs.map((s) => s.meaning), ['today', 'topic', 'what', 'object', 'do', 'question']);
  });

  test('punctuation joins the word before it, even when listed as a word', () => {
    assert.deepEqual(texts(glossSegments(line('こんにちは！', [['こんにちは', 'hello'], ['！', '']]))), ['こんにちは！']);
  });

  test('text the words skip stays in, unglossed, so the sentence reads through', () => {
    const segs = glossSegments(line('{何|なに}を{飲|の}みますか？', [['{何|なに}', 'what'], ['を', 'object']]));
    assert.deepEqual(texts(segs), ['{何|なに}', 'を', '飲みますか？']);
    assert.equal(segs[2].meaning, undefined);
  });

  test('a word missing from the sentence is skipped, not shown out of place', () => {
    assert.deepEqual(texts(glossSegments(line('はい', [['いいえ', 'no'], ['はい', 'yes']]))), ['はい']);
  });

  test('with no usable words the sentence is shown whole', () => {
    assert.deepEqual(texts(glossSegments(line('{元気|げんき}？', []))), ['{元気|げんき}？']);
  });

  test('a kanji word without furigana gets its reading as markup', () => {
    assert.deepEqual(texts(glossSegments(line('元気', [['元気', 'well']], 'げんき'))), ['{元気|げんき}']);
  });

  test('an opening bracket goes with the word it opens; a closing one with the word it closes', () => {
    const words: [string, string][] = [['しんせかい', 'Shinsekai'], ['の', 'of'], ['だるま', 'Daruma'], ['が', 'subject']];
    assert.deepEqual(texts(glossSegments(line('しんせかいの「だるま」が', words))), ['しんせかい', 'の', '「だるま」', 'が']);
    // Listed as words of their own, too.
    const listed: [string, string][] = [['の', 'of'], ['「', ''], ['だるま', 'Daruma'], ['」', '']];
    assert.deepEqual(texts(glossSegments(line('の「だるま」', listed))), ['の', '「だるま」']);
  });

  test('an opening bracket with nothing after it still shows', () => {
    assert.deepEqual(texts(glossSegments(line('はい「', [['はい', 'yes']]))), ['はい', '「']);
  });
});

describe('breakdown glosses', () => {
  test('render the markdown models put in them', () => {
    const breakdown: Breakdown = {
      lines: [{ japanese: 'だるま', translation: 't', explanation: '', words: [{ text: 'だるま', reading: 'だるま', meaning: '(Daruma *in* Shinsekai)' }] }],
    };
    const html = render(<BreakdownView breakdown={breakdown} />);
    assert.match(html, /<em><span>in<\/span><\/em>/);
    assert.ok(!html.includes('*in*'));
  });
});

describe('the learner\'s own text', () => {
  test('JpText with highlight off shows kanji details but never marks them', () => {
    const html = render(<JpText text="人と語と薔" highlight={false} />, { wkLevel: 1 });
    assert.equal(count(html, 'over-level'), 0);
    assert.match(html, /class="kanji" title="語 — [^"]*WaniKani level/);
    assert.ok(!html.includes('Above your WaniKani level'));
  });

  test('a line quoted from the learner is not marked, the AI\'s better version is', () => {
    const f: Feedback = {
      ...feedback,
      lines: [{ original: '語です', originalTranslation: 't', corrected: '語だ', translation: 't', explanation: '', ok: false }],
    };
    const html = render(<FeedbackView feedback={f} />, { wkLevel: 1 });
    assert.equal(count(html, 'over-level'), 1, 'only the better version');
    assert.match(html, /fix-row-fix"><div class="line-jp"><span class="jp"><span class="kanji over-level"/);
  });

  test('the overview shows what they said, not the whole corrected message again', () => {
    const html = render(<FeedbackView feedback={{ ...feedback, meaning: 'Coffee, please.', corrected: 'ぜんぶ' }} />, { wkLevel: 60 });
    assert.match(html, /<dt>You said<\/dt><dd>.*Coffee, please\./s);
    assert.ok(!html.includes('Natural Japanese'));
    assert.ok(!html.includes('ぜんぶ'));
  });
});

describe('inline markdown in the AI\'s English', () => {
  test('parses bold, italic and code, leaving the rest as text', () => {
    assert.deepEqual(parseInline("what you're *going* to do, **not** `ある`"), [
      { kind: 'text', text: "what you're " },
      { kind: 'em', text: 'going' },
      { kind: 'text', text: ' to do, ' },
      { kind: 'strong', text: 'not' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'ある' },
    ]);
  });

  test('leaves stray or spaced-out asterisks alone', () => {
    for (const s of ['5 * 3 = 15', 'a lone * here', '* not italic *', 'plain text']) {
      assert.deepEqual(parseInline(s), [{ kind: 'text', text: s }], s);
    }
  });

  test('allows several words inside a mark', () => {
    assert.deepEqual(parseInline('**the main fix**'), [{ kind: 'strong', text: 'the main fix' }]);
  });

  test('the feedback summary renders *going* as italic', () => {
    const f: Feedback = { ...feedback, summary: "They asked what you're *going* to do today." };
    const html = render(<FeedbackView feedback={f} />, { wkLevel: 60 });
    assert.match(html, /what you&#x27;re <\/span><em><span>going<\/span><\/em><span> to do today\./);
    assert.ok(!html.includes('*going*'));
  });

  test('explanations, translations and "You said" all render markdown, with furigana inside', () => {
    const f: Feedback = {
      ...feedback,
      meaning: 'I **have** work',
      lines: [{ ...feedback.lines[0], translation: 'A *coffee*', explanation: 'Use **{今日|きょう}** here.' }],
    };
    const html = render(<FeedbackView feedback={f} />, { wkLevel: 60 });
    assert.match(html, /<strong><span>have<\/span><\/strong>/);
    assert.match(html, /<em><span>coffee<\/span><\/em>/);
    assert.match(html, /<strong><span><ruby>.*今.*<rt>きょう<\/rt>/s);
  });
});

describe('Japanese quoted in 「」 inside English', () => {
  test('is parsed as a term without its brackets', () => {
    assert.deepEqual(parseInline('「は」 marks the topic and 「が」 goes with 「ある」.'), [
      { kind: 'term', text: 'は' },
      { kind: 'text', text: ' marks the topic and ' },
      { kind: 'term', text: 'が' },
      { kind: 'text', text: ' goes with ' },
      { kind: 'term', text: 'ある' },
      { kind: 'text', text: '.' },
    ]);
  });

  test('renders as a highlighted term with no brackets left, furigana still working', () => {
    const f: Feedback = { ...feedback, summary: 'use 「ある」 instead of 「{有|あ}ります」' };
    const html = render(<FeedbackView feedback={f} />, { wkLevel: 60 });
    assert.ok(!/[「」]/.test(html.match(/<p class="feedback-summary">.*?<\/p>/s)![0]));
    assert.match(html, /<span class="jp-term"><span>ある<\/span><\/span>/);
    assert.match(html, /<span class="jp-term"><span><ruby>/);
  });

  test('leaves a lone bracket alone', () => {
    assert.deepEqual(parseInline('a 「 here'), [{ kind: 'text', text: 'a 「 here' }]);
  });

  test('the Japanese itself (not RichText) keeps its brackets', () => {
    const html = render(<JpText text="「はい」と言った" />, { wkLevel: 60 });
    assert.ok(html.includes('「はい」'));
  });
});

describe('message context line', () => {
  const ctx: MessageContext = { provider: 'claude', model: 'claude-opus-5-5', effort: 'high', politeness: 'casual', wkLevel: 12, genkiLesson: 6, jlptLevel: 4 };

  test('lists the model, effort, style and levels', () => {
    assert.ok(render(<ContextLine context={ctx} />).includes('>Opus 5.5 · Effort: High · Casual · WK 12 · Genki L6 · N4<'));
  });

  test('leaves out what is not set, and says kana only for level 0', () => {
    const html = render(<ContextLine context={{ provider: 'endpoint', model: 'qwen3', politeness: 'polite', wkLevel: 0, genkiLesson: 0, jlptLevel: 0 }} />);
    assert.ok(html.includes('>qwen3 · Polite · Kana only<'));
  });

  test('follows the UI language', () => {
    assert.ok(render(<ContextLine context={ctx} />, { uiLanguage: 'ja' }).includes('>Opus 5.5 · 思考レベル：高 · カジュアル · WK12 · げんき第6課 · N4<'));
  });

});

describe('kanji marks follow the level a message was written at', () => {
  const stamp: MessageContext = { provider: 'claude', model: 'claude-opus-5-5', effort: 'high', politeness: 'polite', wkLevel: 20, genkiLesson: 0, jlptLevel: 0 };
  // 飲 is above level 3 and within 20.
  const message: Message = { id: 'm', role: 'assistant', content: '{何|なに}を{飲|の}みますか', createdAt: '', context: stamp };
  const bubble = (m: Message, wkLevel: number) => render(<MessageBubble chatId="c" message={m} onUpdated={() => {}} />, { wkLevel });

  test('a message written at a higher level is not marked after the level is lowered', () => {
    assert.equal(count(bubble(message, 3), 'over-level'), 0);
  });

  test('a message is still marked for kanji above the level it was written at, and only those, naming that level', () => {
    // 何 is level 5, 飲 level 10: at a stamp of 7 only 飲 is above it.
    const html = bubble({ ...message, context: { ...stamp, wkLevel: 7 } }, 60);
    assert.equal(count(html, 'over-level'), 1);
    assert.match(html, /class="kanji over-level" title="Above WaniKani level 7, the level this was written at\n飲/);
  });

  test('a message from before stamping uses the current level, and says so', () => {
    const { context: _, ...old } = message;
    const html = bubble(old, 7);
    assert.equal(count(html, 'over-level'), 1);
    assert.match(html, /title="Above your WaniKani level \(7\)\n飲/);
    assert.equal(count(bubble(old, 20), 'over-level'), 0);
  });
});

describe('kanji the learner has typed', () => {
  test('are never marked as above the level', () => {
    // 語 and 串 are both above level 1.
    const html = render(
      <KnownKanjiProvider value="串">
        <JpText text="串と語" />
      </KnownKanjiProvider>,
      { wkLevel: 1 },
    );
    assert.equal(count(html, 'over-level'), 1);
    assert.match(html, /class="kanji over-level"[^>]*>語/);
  });
});

describe('readings with furigana off', () => {
  test('a word with a kanji the learner doesn\'t know keeps its reading; known ones lose theirs', () => {
    const html = render(
      <KnownKanjiProvider value="串">
        <JpText text="{日本語|にほんご}と{串|くし}と{人|ひと}" />
      </KnownKanjiProvider>,
      { wkLevel: 1, furigana: false },
    );
    assert.equal(count(html, '<rt>'), 1);
    assert.match(html, /<rt>にほんご<\/rt>/);
  });
});

describe('the welcome text', () => {
  test('puts the buttons it names in place, in both languages, and says nothing about tapping', () => {
    for (const lang of ['en', 'ja'] as const) {
      const html = renderToStaticMarkup(<>{STRINGS[lang].emptyBody(<b>B</b>, <b>C</b>)}</>);
      assert.match(html, /<b>B<\/b>.*<b>C<\/b>/s, lang);
      assert.ok(!/Tap|タップ/.test(html), lang);
    }
  });

  test('the Breakdown hint puts the button in place too, in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      const html = renderToStaticMarkup(<>{STRINGS[lang].breakdownHint(<b>B</b>)}</>);
      assert.match(html, /<b>B<\/b>/, lang);
      assert.ok(!/Tap|タップ/.test(html), lang);
    }
  });
});

describe('message info', () => {
  const ctx: MessageContext = { provider: 'claude', model: 'claude-opus-5-5', effort: 'high', politeness: 'casual', wkLevel: 12, genkiLesson: 6, jlptLevel: 4 };
  const message: Message = { id: 'm', role: 'assistant', content: 'こんにちは', createdAt: '2026-11-03T05:30:00.000Z', context: ctx };
  const bubble = (m: Message) => render(<MessageBubble chatId="c" message={m} onUpdated={() => {}} />);

  test('the partner\'s stamped messages get a closed ⓘ button', () => {
    const html = bubble(message);
    assert.match(html, /<button type="button" class="icon-button " aria-label="How this message was written" aria-expanded="false"/);
    assert.ok(!html.includes('message-info-pop'), 'closed until clicked');
  });

  test('not on the learner\'s messages, nor on messages from before stamping', () => {
    assert.ok(!bubble({ ...message, role: 'user' }).includes('message-info'));
    const { context: _, ...old } = message;
    assert.ok(!bubble(old).includes('message-info'));
  });

  test('lists the model, provider, effort, style, levels and when it was written, labelled', () => {
    const html = render(<ContextDetails context={ctx} createdAt={message.createdAt} />);
    const rows = [...html.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(rows.slice(0, 7), [
      ['Model', 'Opus 5.5'],
      ['AI provider', 'Claude Code CLI'],
      ['Effort', 'High'],
      ['Partner’s speech style', 'Casual (plain form)'],
      ['WaniKani level', '12'],
      ['Genki lesson', 'Genki I · Lesson 6'],
      ['JLPT level', 'N4'],
    ]);
    assert.equal(rows[7][0], 'Written');
    assert.match(rows[7][1], /3 Nov 2026/);
  });

  test('an endpoint has no effort row; unset levels say so', () => {
    const html = render(
      <ContextDetails context={{ provider: 'endpoint', model: 'qwen3', politeness: 'polite', wkLevel: 0, genkiLesson: 0, jlptLevel: 0 }} createdAt="" />,
    );
    assert.ok(!html.includes('<dt>Effort</dt>'));
    assert.ok(html.includes('<dt>Thinking</dt><dd>Model default</dd>'));
    for (const text of ['<dd>qwen3</dd>', '<dd>Kana only</dd>', '<dd>Not using Genki</dd>', '<dd>Not set</dd>', '<dd>Polite (です/ます)</dd>']) assert.ok(html.includes(text), text);
  });

  test('an endpoint shows its thinking setting, in the row and the one-line stamp', () => {
    const off: MessageContext = { provider: 'endpoint', model: 'qwen3', effort: 'none', politeness: 'polite', wkLevel: 5, genkiLesson: 0, jlptLevel: 0 };
    assert.ok(render(<ContextDetails context={off} createdAt="" />).includes('<dt>Thinking</dt><dd>Off</dd>'));
    assert.ok(render(<ContextDetails context={{ ...off, effort: undefined }} createdAt="" />).includes('<dt>Thinking</dt><dd>Model default</dd>'));
    assert.ok(render(<ContextLine context={off} />).includes('>qwen3 · Thinking: Off · Polite · WK 5<'));
    assert.ok(render(<ContextLine context={off} />, { uiLanguage: 'ja' }).includes('>qwen3 · 思考：オフ · 丁寧 · WK5<'));
    assert.ok(render(<ContextDetails context={{ ...off, effort: 'high' }} createdAt="" />, { uiLanguage: 'ja' }).includes('<dt>思考</dt><dd>高</dd>'));
  });

  test('Claude\'s default effort is named, and the labels follow the UI language', () => {
    const html = render(<ContextDetails context={{ ...ctx, effort: undefined }} createdAt={message.createdAt} />, { uiLanguage: 'ja' });
    assert.ok(html.includes('<dt>思考レベル</dt><dd>CLIの既定</dd>'));
    assert.ok(render(<ContextDetails context={{ ...ctx, effort: 'xhigh' }} createdAt="" />, { uiLanguage: 'ja' }).includes('<dt>思考レベル</dt><dd>とても高い</dd>'));
    assert.ok(html.includes('<dd>げんきI・第6課</dd>'));
  });
});

describe('ChatSettingsDialog', () => {
  const chat: Chat = { id: 'c', title: 'Café', topic: 'Ordering', politeness: 'casual', createdAt: '', updatedAt: '', messages: [] };

  test('shows the chat\'s title, topic and style, and the app-wide model and levels the next message will use', () => {
    const html = render(<ChatSettingsDialog chat={chat} onSave={() => {}} onClose={() => {}} />, {
      provider: 'claude',
      claude: { ...DEFAULT_SETTINGS.claude, model: 'claude-haiku-5-5', effort: '' },
      wkLevel: 8,
    });
    assert.match(html, /value="Café"/);
    assert.match(html, /value="Ordering"/);
    assert.ok(html.includes('<label class="active"><input type="radio" checked=""/>Casual (plain form)'));
    assert.match(html, /class="context-line chat-uses"[^>]*>Haiku 5\.5 · Casual · WK 8</);
  });
});

describe('SetupNotice', () => {
  const endpoint = (model: string) => ({ ...DEFAULT_SETTINGS.endpoint, model });

  test('only an endpoint with no model needs one', () => {
    assert.equal(needsModel({ ...DEFAULT_SETTINGS, provider: 'endpoint', endpoint: endpoint('') }), true);
    assert.equal(needsModel({ ...DEFAULT_SETTINGS, provider: 'endpoint', endpoint: endpoint('qwen') }), false);
    assert.equal(needsModel({ ...DEFAULT_SETTINGS, provider: 'claude', endpoint: endpoint('') }), false);
  });

  test('shows while no model is chosen, and not once one is', () => {
    assert.match(render(<SetupNotice onOpenSettings={() => {}} />, { provider: 'endpoint', endpoint: endpoint('') }), /Choose a model first.*Open Settings/);
    assert.equal(render(<SetupNotice onOpenSettings={() => {}} />, { provider: 'endpoint', endpoint: endpoint('qwen') }), '');
  });
});

describe('accessible names and states', () => {
  const attr = (html: string, tag: string, name: string) => html.match(new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`))?.[1];

  test('a dialog is named by its heading', () => {
    const chat: Chat = { id: 'c', title: 'Café', topic: '', politeness: 'polite', createdAt: '', updatedAt: '', messages: [] };
    const html = render(<ChatSettingsDialog chat={chat} onSave={() => {}} onClose={() => {}} />);
    const id = attr(html, 'dialog', 'aria-labelledby');
    assert.ok(id);
    assert.ok(html.includes(`<h2 id="${id}">Chat settings</h2>`));
  });

  test('a confirmation is described by its question', () => {
    const html = render(<ConfirmDialog title="Delete chat" message="Delete it?" confirmLabel="Delete" cancelLabel="Cancel" onConfirm={() => {}} onCancel={() => {}} />);
    const id = attr(html, 'dialog', 'aria-describedby');
    assert.ok(id);
    assert.ok(html.includes(`id="${id}">Delete it?</p>`));
  });

  test('the composer has a name, and the romaji toggle\'s name starts with the glyph it shows', () => {
    const composer = (patch: Partial<Settings> = {}) => render(<Composer chatId="c" disabled={false} onSend={async () => true} />, patch);
    const html = composer();
    assert.equal(attr(html, 'textarea', 'aria-label'), 'Message');
    // No aria-label replacing what is on screen, and the state only in aria-pressed, not in the title too.
    assert.match(html, /<button[^>]*aria-pressed="true">あ<span class="sr-only"> Convert romaji to kana while typing<\/span><\/button>/);
    assert.doesNotMatch(html, /romaji-toggle[^>]*title=/);
    assert.match(composer({ romajiInput: false }), /aria-pressed="false">A<span class="sr-only">/);
    assert.equal(attr(composer({ uiLanguage: 'ja' }), 'textarea', 'aria-label'), 'メッセージ');
  });

  test('the sidebar marks the open chat, and the language is one choice of two', () => {
    const chats: ChatSummary[] = ['a', 'b'].map((id) => ({ id, title: id.toUpperCase(), topic: '', createdAt: '', updatedAt: '2026-01-01T00:00:00Z' }));
    const props = { chats, asideRef: { current: null }, onSelect: () => {}, onNew: () => {}, onRename: () => {}, onDelete: async () => {}, onSettings: () => {} };
    const html = render(<Sidebar {...props} activeId="b" />);
    assert.equal(count(html, 'aria-current'), 1);
    assert.match(html, /aria-current="page"><span class="chat-title jp" title="B">B</);
    assert.match(html, /role="radiogroup" aria-label="Interface language"/);
    assert.match(html, /<label class="active"><input type="radio" name="ui-language" checked=""\/>EN<\/label>/);
    assert.match(html, /<label class=""><input type="radio" name="ui-language"\/>日本語<\/label>/);
    assert.match(render(<Sidebar {...props} activeId={null} />, { uiLanguage: 'ja' }), /<label class="active"><input type="radio" name="ui-language" checked=""\/>日本語/);
  });

  test('the WaniKani level is a group, its slider and number box named apart, with the hint as their description', () => {
    const html = render(<SettingsDialog onClose={() => {}} />, { wkLevel: 5 });
    const group = html.match(/<div class="field" role="group" aria-labelledby="([^"]+)"><label class="field-label" id="([^"]+)" for="([^"]+)">/);
    assert.ok(group);
    assert.equal(group[1], group[2]);
    const [slider, box] = [...html.matchAll(/<input[^>]*type="(range|number)"[^>]*>/g)].map((m) => m[0]);
    assert.ok(slider.includes(`id="${group[3]}"`), 'the heading is the slider\'s label');
    assert.match(slider, /aria-label="WaniKani level"/);
    assert.match(box, /aria-label="Type a WaniKani level"/);
    const hint = html.match(/<small class="muted" id="([^"]+)">Your partner may use the \d+ kanji from levels 1–5/)?.[1];
    assert.ok(hint);
    for (const input of [slider, box]) assert.ok(input.includes(`aria-describedby="${hint}"`));
  });

  test('every other field\'s hint describes its control rather than running into its name', () => {
    for (const patch of [{ provider: 'endpoint' as const }, { provider: 'claude' as const }]) {
      const html = render(<SettingsDialog onClose={() => {}} />, patch);
      // No <label> wraps a control any more, so no hint (or chosen option) can become part of a name.
      assert.equal(count(html, '<label class="field">'), 0);
      for (const [, id, hintId] of html.matchAll(/<(?:select|input) [^>]*id="([^"]+)"[^>]*aria-describedby="([^"]+)"/g)) {
        assert.match(html, new RegExp(`<label class="field-label"[^>]* for="${id}">`), `control ${id} has its own label`);
        assert.ok(html.includes(`<small class="muted" id="${hintId}">`), `control ${id} is described by a hint`);
      }
    }
    const genki = render(<SettingsDialog onClose={() => {}} />);
    assert.match(genki, /<label class="field-label" for="([^"]+)">Genki lesson<\/label><select id="\1" aria-describedby="[^"]+"/);
  });
});
