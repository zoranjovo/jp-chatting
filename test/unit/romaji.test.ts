import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { romajiAtCaret, romajiToKana, romajiWordsToKana } from '../../src/romaji.ts';

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
      'shinbunn.': 'しんぶん。',
      kannji: 'かんじ',
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
      'RA-MENN.': 'ラーメン。',
      PATHI: 'パティ',
      PATI: 'パチ',
      TEREBI: 'テレビ',
      toukyouTAWA: 'とうきょうタワ', // each syllable takes the case of its first letter
      'KONNPYU-TA-': 'コンピューター',
      SANNDOICCHI: 'サンドイッチ',
      KKA: 'ッカ',
    });
  });

  test('nn before a vowel or y is ん and an n-syllable, as learners spell it', () => {
    check({ konnichiwa: 'こんにちわ', minna: 'みんな', onna: 'おんな', konnyaku: 'こんにゃく', 'KONNICHIWA': 'コンニチワ' });
  });

  test('a trailing nn waits for the next letter, unless final', () => {
    assert.equal(romajiToKana('minn'), 'みnn');
    assert.equal(romajiToKana('minn', true), 'みん');
    assert.equal(romajiToKana('minna'), 'みんな');
  });

  test('a Capitalised word is hiragana, as English typists start a sentence', () => {
    check({ Watashi: 'わたし', 'Watashi ha Samu desu.': 'わたし は さむ です。', Ii: 'いい', Arigatou: 'ありがとう', Terebi: 'てれび' });
  });

  test('a capital vowel starting a word waits to see whether the word is Capitalised or in CAPS', () => {
    assert.equal(romajiToKana('A'), 'A');
    assert.equal(romajiToKana('A', true), 'ア');
    assert.equal(romajiToKana('Ar'), 'あr');
    assert.equal(romajiToKana('AI'), 'アイ');
    assert.equal(romajiToKana('AISU'), 'アイス');
    assert.equal(romajiToKana('hai, A'), 'はい、 A');
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
    for (const word of ['konnnichiha', 'gakkou', 'kyoushitsu', 'KO-HI-', 'shinnbunn', 'konnichiwa', 'minna', 'Watashi', 'Arigatou', 'AISU', 'Ii']) {
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

describe('romajiWordsToKana (pasted text, and on send)', () => {
  test('converts each word that is all romaji, with a trailing n as ん', () => {
    assert.equal(romajiWordsToKana('arigatou gozaimasu!'), 'ありがとう ございます！');
    assert.equal(romajiWordsToKana('nihon\nhon'), 'にほん\nほん');
  });

  test('leaves English that would not convert as it is', () => {
    assert.equal(romajiWordsToKana('Netflix wo mimashita'), 'Netflix を みました');
    assert.equal(romajiWordsToKana('www lol'), 'www lol');
  });

  test('leaves text already in kana or kanji alone', () => {
    assert.equal(romajiWordsToKana('コーヒーをください。'), 'コーヒーをください。');
    assert.equal(romajiWordsToKana('ほn'), 'ほん');
  });
});

describe('romajiAtCaret (typing)', () => {
  test('converts the word being typed, and a space just typed settles its trailing n', () => {
    assert.equal(romajiAtCaret('はい hon'), 'はい ほn');
    assert.equal(romajiAtCaret('はい hon '), 'はい ほん ');
  });

  test('leaves earlier words as they are, so pasted English stays English', () => {
    assert.equal(romajiAtCaret('Netflix mita'), 'Netflix みた');
    assert.equal(romajiAtCaret('Netflix\nmita'), 'Netflix\nみた');
  });
});
