import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { romajiToKana } from '../../src/romaji.ts';

const check = (cases: Record<string, string>) => {
  for (const [input, expected] of Object.entries(cases)) assert.equal(romajiToKana(input), expected, input);
};

describe('romajiToKana', () => {
  test('basic syllables', () => {
    check({
      aiueo: 'あいうえお',
      kakikukeko: 'かきくけこ',
      sashisuseso: 'さしすせそ',
      tachitsuteto: 'たちつてと',
      naninuneno: 'なにぬねの',
      hahifuheho: 'はひふへほ',
      mamimumemo: 'まみむめも',
      yayuyo: 'やゆよ',
      rarirurero: 'らりるれろ',
      wawo: 'わを',
    });
  });

  test('voiced and half-voiced', () => {
    check({ gagigugego: 'がぎぐげご', zajizuzezo: 'ざじずぜぞ', dadidudedo: 'だぢづでど', babibubebo: 'ばびぶべぼ', papipupepo: 'ぱぴぷぺぽ' });
  });

  test('alternative spellings', () => {
    check({ si: 'し', ti: 'ち', tu: 'つ', hu: 'ふ', zi: 'じ', sya: 'しゃ', tya: 'ちゃ', jya: 'じゃ', zya: 'じゃ' });
  });

  test('contracted sounds', () => {
    check({ kyakyukyo: 'きゃきゅきょ', shashusho: 'しゃしゅしょ', chachucho: 'ちゃちゅちょ', jajujo: 'じゃじゅじょ', nyanyunyo: 'にゃにゅにょ', ryo: 'りょ', pyu: 'ぴゅ' });
  });

  test('ん from nn, n\', and n before a consonant or punctuation', () => {
    check({
      konnnichiha: 'こんにちは',
      shinbunn: 'しんぶん',
      "kin'youbi": 'きんようび',
      kinyoubi: 'きにょうび',
      sanpo: 'さんぽ',
      'pan.': 'ぱん。',
      'hon!': 'ほん！',
    });
  });

  test('a doubled consonant is っ', () => {
    check({ gakkou: 'がっこう', kitte: 'きって', zasshi: 'ざっし', matcha: 'まtちゃ', icchi: 'いっち', roppon: 'ろっぽn' });
  });

  test('small kana with x or l', () => {
    check({ xa: 'ぁ', li: 'ぃ', xtsu: 'っ', ltu: 'っ', xya: 'ゃ', lyo: 'ょ', xwa: 'ゎ' });
  });

  test('foreign sounds', () => {
    check({ fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', thi: 'てぃ', dhi: 'でぃ', she: 'しぇ', che: 'ちぇ', je: 'じぇ', va: 'ゔぁ', vu: 'ゔ', wi: 'うぃ', we: 'うぇ' });
  });

  test('CAPS give katakana', () => {
    check({
      'KO-HI-': 'コーヒー',
      'RA-MENN': 'ラーメン',
      PATHI: 'パティ',
      PATI: 'パチ',
      TEREBI: 'テレビ',
      Terebi: 'テれび', // each syllable takes the case of its first letter
      'KONNPYU-TA-': 'コンピューター',
      SANNDOICCHI: 'サンドイッチ',
      KKA: 'ッカ',
    });
  });

  test('a mix of katakana and hiragana words', () => {
    check({ 'KO-HI-wo nomimasu': 'コーヒーを のみます' });
  });

  test('punctuation', () => {
    check({ 'hai.': 'はい。', 'ee,': 'ええ、', 'hontou?': 'ほんとう？', 'sugoi!': 'すごい！', 'su-pa-': 'すーぱー', '[hai]': '「はい」', 'ne~': 'ね〜' });
  });

  test('whole sentences', () => {
    check({
      'watashi ha gakusei desu.': 'わたし は がくせい です。',
      'nihongo wo benkyou shiteimasu': 'にほんご を べんきょう しています',
      'kyou ha samui desu ne.': 'きょう は さむい です ね。',
    });
  });

  test('kana, kanji and numbers already there pass through', () => {
    check({ 'すでに kana': 'すでに かな', '日本 ni ikimasu': '日本 に いきます', '3ji': '3じ', 'カタカナ': 'カタカナ' });
  });

  test('an unfinished syllable stays as typed until it completes', () => {
    assert.equal(romajiToKana('k'), 'k');
    assert.equal(romajiToKana('ky'), 'ky');
    assert.equal(romajiToKana('kya'), 'きゃ');
    assert.equal(romajiToKana('sh'), 'sh');
    assert.equal(romajiToKana('ts'), 'ts');
  });

  test('converting twice changes nothing (typing converts the text on every key)', () => {
    for (const s of ['watashi ha gakusei desu.', 'KO-HI-', "kin'youbi", 'gakkou']) {
      const once = romajiToKana(s);
      assert.equal(romajiToKana(once), once, s);
    }
  });

  test('typing one key at a time ends where typing it all at once does', () => {
    for (const word of ['konnnichiha', 'gakkou', 'kyoushitsu', 'KO-HI-', 'shinnbunn']) {
      let text = '';
      for (const ch of word) text = romajiToKana(text + ch);
      assert.equal(text, romajiToKana(word), word);
    }
  });

  test('a trailing n waits for the next letter, unless final', () => {
    assert.equal(romajiToKana('hon'), 'ほn');
    assert.equal(romajiToKana('hon', true), 'ほん');
    assert.equal(romajiToKana('HON', true), 'ホン');
    assert.equal(romajiToKana('hona'), 'ほな');
    assert.equal(romajiToKana('honya'), 'ほにゃ');
  });

  test('empty input', () => {
    assert.equal(romajiToKana(''), '');
    assert.equal(romajiToKana('', true), '');
  });
});
