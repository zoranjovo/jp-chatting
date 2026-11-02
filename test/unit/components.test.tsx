// Components rendered to static HTML: checks markup without a browser. The
// interactive behaviour is covered by the Playwright tests in test/ui.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SETTINGS, type Breakdown, type Feedback, type Settings } from '../../shared/types.ts';
import { BreakdownView, FeedbackView, glossSegments } from '../../src/components/Analysis.tsx';
import { JpText } from '../../src/components/JpText.tsx';
import { parseInline } from '../../src/components/RichText.tsx';
import { LanguageProvider } from '../../src/i18n.tsx';
import { SettingsContext } from '../../src/settings.tsx';

function render(node: ReactNode, patch: Partial<Settings> = {}): string {
  const settings = { ...DEFAULT_SETTINGS, ...patch };
  return renderToStaticMarkup(
    <SettingsContext.Provider value={{ settings, update: async () => {} }}>
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
    assert.ok(html.includes('言いたかったこと'));
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
});

describe('the learner\'s own text', () => {
  test('JpText with highlight off shows kanji details but never marks them', () => {
    const html = render(<JpText text="人と語と薔" highlight={false} />, { wkLevel: 1 });
    assert.equal(count(html, 'over-level'), 0);
    assert.match(html, /class="kanji" title="語 — [^"]*WaniKani level/);
    assert.ok(!html.includes('Above your WaniKani level'));
  });

  test('a correct line quoted from the learner is not marked, the AI\'s natural version is', () => {
    const f: Feedback = {
      ...feedback,
      corrected: '語',
      lines: [{ original: '語です', originalTranslation: 't', corrected: '語です', translation: 't', explanation: '', ok: true }],
    };
    const html = render(<FeedbackView feedback={f} />, { wkLevel: 1 });
    assert.equal(count(html, 'over-level'), 1, 'only the corrected version in "Natural Japanese"');
    assert.match(html, /<dd class="line-jp"><span class="jp"><span class="kanji over-level"/);
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

  test('explanations, translations and "You meant" all render markdown, with furigana inside', () => {
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
