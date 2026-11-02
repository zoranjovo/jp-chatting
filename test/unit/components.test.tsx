// Components rendered to static HTML: checks markup without a browser. The
// interactive behaviour is covered by the Playwright tests in test/ui.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SETTINGS, type Breakdown, type Feedback, type Settings } from '../../shared/types.ts';
import { BreakdownView, FeedbackView } from '../../src/components/Analysis.tsx';
import { JpText } from '../../src/components/JpText.tsx';
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

  test('word chips show the reading only when it differs from the text', () => {
    const html = render(<BreakdownView breakdown={breakdown} />, { wkLevel: 60, furigana: false });
    assert.equal(count(html, 'class="word"'), 2);
    assert.equal(count(html, 'word-reading'), 1);
  });
});

const feedback: Feedback = {
  meaning: 'A coffee, please.',
  verdict: 'minor',
  corrected: 'コーヒーをお{願|ねが}いします。',
  summary: 'Use を here.',
  lines: [
    { original: 'コーヒーがおねがいします。', corrected: 'コーヒーをお{願|ねが}いします。', translation: 'A coffee, please.', explanation: 'を, not が.', ok: false },
    { original: 'ありがとう。', corrected: 'ありがとう。', translation: 'Thanks.', explanation: '', ok: true },
  ],
};

describe('FeedbackView', () => {
  test('shows the verdict, meaning and natural version', () => {
    const html = render(<FeedbackView feedback={feedback} />, { wkLevel: 60 });
    assert.match(html, /class="verdict verdict-minor">Almost — small fixes</);
    assert.ok(html.includes('A coffee, please.'));
    assert.ok(html.includes('Use を here.'));
  });

  test('a line that needed fixing shows the original struck through and the fix', () => {
    const html = render(<FeedbackView feedback={feedback} />, { wkLevel: 60 });
    assert.match(html, /class="strike">コーヒーがおねがいします。</);
    assert.equal(count(html, 'line-fix'), 1);
    assert.equal(count(html, 'line-ok'), 1);
  });

  test('labels follow the UI language', () => {
    const html = render(<FeedbackView feedback={feedback} />, { wkLevel: 60, uiLanguage: 'ja' });
    assert.ok(html.includes('おしい！少し直しましょう'));
    assert.ok(html.includes('言いたかったこと'));
  });
});
