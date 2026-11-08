import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { autoFix, badFurigana, dropKanaFurigana, foreignText, kanaForKanjiAboveLevel, problemCount, replyProblems, salvageFromForeign, tidyMarkup } from '../../shared/quality.ts';

describe('badFurigana', () => {
  test('accepts hiragana readings on kanji', () => {
    assert.deepEqual(badFurigana('{日本語|にほんご}を{話|はな}します。{人々|ひとびと}'), []);
  });

  test('accepts the long-vowel and iteration marks in readings', () => {
    assert.deepEqual(badFurigana('{東京|とーきょー}{時々|ときどき}'), []);
  });

  test('flags romaji and katakana readings', () => {
    assert.deepEqual(badFurigana('{待|machi}って{日|ニチ}'), ['{待|machi}', '{日|ニチ}']);
  });

  test('flags markup on kana-only words', () => {
    assert.deepEqual(badFurigana('{カフェ|cafe}と{すし|すし}'), ['{カフェ|cafe}', '{すし|すし}']);
  });

  test('flags an empty reading', () => {
    assert.deepEqual(badFurigana('{日|}'), ['{日|}']);
  });

  test('reports each bad markup once', () => {
    assert.deepEqual(badFurigana('{日|ひ}{待|machi}{待|machi}'), ['{待|machi}']);
  });
});

describe('dropKanaFurigana', () => {
  test('removes markup from kana-only words and keeps the rest', () => {
    assert.equal(dropKanaFurigana('{カフェ|cafe}で{待|ま}つ'), 'カフェで{待|ま}つ');
  });

  test('keeps markup whose base has kanji, even if the reading is wrong', () => {
    assert.equal(dropKanaFurigana('{待|machi}'), '{待|machi}');
  });

  test('leaves text without markup alone', () => {
    assert.equal(dropKanaFurigana('こんにちは'), 'こんにちは');
  });
});

describe('foreignText', () => {
  test('catches an English note left in a reply', () => {
    const text = 'いらっしゃいませ！ご{注文|ちゅうもん}は？ Wait — that kanji is outside the list. Let me redo this.';
    const found = foreignText(text);
    assert.ok(found.some((f) => f.includes('Let me redo this')), found.join(' / '));
  });

  test('catches romaji', () => {
    assert.deepEqual(foreignText('watashi desu'), ['watashi', 'desu']);
    assert.deepEqual(foreignText('コーヒーは cafe で'), ['cafe']);
  });

  test('allows acronyms and brand-style words', () => {
    assert.deepEqual(foreignText('OK！LINEで れんらくします。Wi-Fiは ありますか？iPhoneです。SNSも。'), []);
  });

  test('ignores furigana readings, which badFurigana handles', () => {
    assert.deepEqual(foreignText('{待|machi}って'), []);
  });

  test('plain Japanese has none', () => {
    assert.deepEqual(foreignText('{今日|きょう}は{何|なに}を{飲|の}みますか？'), []);
  });
});

describe('replyProblems', () => {
  test('collects every kind of problem', () => {
    const p = replyProblems('こんにちは！{カフェ|cafe}で{待|machi}っています。Let me fix this now.', 10);
    assert.deepEqual(p.kanji, ['待']);
    assert.deepEqual(p.furigana, ['{カフェ|cafe}', '{待|machi}']);
    assert.equal(p.foreign.length, 1);
    assert.equal(problemCount(p), 4);
  });

  test('a clean reply has none', () => {
    assert.equal(problemCount(replyProblems('いらっしゃいませ！{何|なに}を{飲|の}みますか？', 10)), 0);
  });
});

describe('stray markup', () => {
  test('flags leftover braces and pipes from malformed markup', () => {
    assert.deepEqual(badFurigana('{名前|なまえ}を{教|おし}}えて'), ['}えて']);
    assert.ok(badFurigana('{アイスコーヒー}ですか').length > 0);
    assert.ok(badFurigana('アイス|ティーですね').length > 0);
  });
});

describe('kanaForKanjiAboveLevel and autoFix', () => {
  test('spells out a word with a kanji above the level from its reading', () => {
    assert.equal(kanaForKanjiAboveLevel('ご{注文|ちゅうもん}は？', 10), 'ごちゅうもんは？');
  });

  test('uses the whole reading when the base mixes kanji and kana', () => {
    assert.equal(kanaForKanjiAboveLevel('{飲み物|のみもの}', 1), 'のみもの');
  });

  test('leaves words within the level alone', () => {
    assert.equal(kanaForKanjiAboveLevel('{人|ひと}と{注文|ちゅうもん}', 10), '{人|ひと}とちゅうもん');
  });

  test('leaves a bad reading for the rewrite instead of trusting it', () => {
    assert.equal(kanaForKanjiAboveLevel('{注|chuu}', 10), '{注|chuu}');
  });

  test('autoFix does both kinds of fix and trims', () => {
    assert.equal(autoFix('  {カフェ|cafe}でご{注文|ちゅうもん}は？ ', 10), 'カフェでごちゅうもんは？');
  });

  test('kanji the learner has typed are kept, and are no problem', () => {
    assert.equal(autoFix('{串|くし}カツと{注文|ちゅうもん}', 10, '串'), '{串|くし}カツとちゅうもん');
    assert.deepEqual(replyProblems('{串|くし}カツ', 10, '串').kanji, []);
    assert.deepEqual(replyProblems('{串|くし}カツ', 10).kanji, ['串']);
  });

  test('tidyMarkup does the other fixes but spells nothing out', () => {
    assert.equal(tidyMarkup(' <think>x</think>{カフェ|cafe}で{}ご{注文|ちゅうもん}は？ '), 'カフェでご{注文|ちゅうもん}は？');
  });
});

describe('autoFix extras', () => {
  test('removes empty braces and braces without a reading', () => {
    assert.equal(autoFix('{}サンドイッチと{アイスコーヒー}ですね', 10), 'サンドイッチとアイスコーヒーですね');
  });

  test('removes a reasoning block, closed or not', () => {
    assert.equal(autoFix('はい！<think>hmm</think>', 10), 'はい！');
    assert.equal(autoFix('はい！ <think>the learner said', 10), 'はい！');
  });

  test('does not spell out markup whose reading misses kana in the base', () => {
    assert.equal(kanaForKanjiAboveLevel('コーヒーを{お願|ねが}いします', 10), 'コーヒーを{お願|ねが}いします');
    assert.equal(kanaForKanjiAboveLevel('コーヒーをお{願|ねが}いします', 10), 'コーヒーをおねがいします');
  });
});

describe('salvageFromForeign', () => {
  test('keeps the clean message before a trailing note', () => {
    assert.equal(salvageFromForeign('{名前|なまえ}を{教|おし}えてください。  Wait, I need to check the kanji carefully.', 30), '{名前|なまえ}を{教|おし}えてください。');
  });

  test('prefers the corrected version after the note', () => {
    assert.equal(salvageFromForeign('今日は何をする？ Wait, 何 is not in the list. Let me rewrite. きょうはなにをする？', 1), 'きょうはなにをする？');
  });

  test('gives up when neither side is clean Japanese', () => {
    assert.equal(salvageFromForeign('This whole reply is in English', 10), null);
    assert.equal(salvageFromForeign('話す and then some more words 待つ', 1), null);
  });

  test('has nothing to do without English', () => {
    assert.equal(salvageFromForeign('こんにちは', 10), null);
  });
});

describe('salvageFromForeign, ambiguous cases', () => {
  test('English in the middle of a real message is left for the model', () => {
    assert.equal(salvageFromForeign('いらっしゃいませ！ please wait a moment ちょっとまってください。', 10), null);
  });

  test('a clean draft and a clean redo of the same message keep the redo', () => {
    assert.equal(salvageFromForeign('きょうは なにを する？ Wait, let me redo this. きょうは なにを するの？', 10), 'きょうは なにを するの？');
  });
});

describe('salvageFromForeign, real Sonnet output', () => {
  test('a draft that thinks aloud through several versions keeps only the last, with no stray punctuation', () => {
    const draft =
      'いらっしゃいませ！カフェへ{ようこそ|ようこそ}。ご注文はなんですか？\n\nWait, I must follow the rules: no markup for kana-only words.\n\nいらっしゃいませ！ようこそ。ご{注文|ちゅうもん}は　なんですか？\n\nHmm, 注 and 文... 注 isn\'t in the list. Rewrite.\n\nいらっしゃいませ！ようこそ。なにを飲みますか？\n\nNeed furigana for 飲 (in list).\n\nいらっしゃいませ！ようこそ。{何|なに}を{飲|の}みますか？';
    assert.equal(salvageFromForeign(autoFix(draft, 10), 10), 'いらっしゃいませ！ようこそ。{何|なに}を{飲|の}みますか？');
  });
});
