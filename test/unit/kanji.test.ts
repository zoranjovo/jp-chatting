import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import rows from '../../shared/wanikani-kanji.json' with { type: 'json' };
import { allowedKanji, isAllowed, isKanji, kanjiAboveLevel, kanjiInfo, MAX_WK_LEVEL, parseWkLevel, stripFurigana } from '../../shared/kanji.ts';

describe('the bundled WaniKani list', () => {
  test('covers all 60 levels with about 2,000 kanji', () => {
    const levels = new Set((rows as [string, number][]).map((r) => r[1]));
    assert.equal(levels.size, 60);
    assert.ok(rows.length > 2000 && rows.length < 2200, String(rows.length));
  });

  test('every row is well formed and every kanji appears once', () => {
    const seen = new Set<string>();
    for (const [k, level, meaning] of rows as [string, number, string, string, string][]) {
      assert.ok(isKanji(k), k);
      assert.ok(Number.isInteger(level) && level >= 1 && level <= MAX_WK_LEVEL, k);
      assert.ok(meaning, `${k} has a meaning`);
      assert.ok(!seen.has(k), `${k} is duplicated`);
      seen.add(k);
    }
  });

  test('level 1 holds the first kanji WaniKani teaches', () => {
    for (const k of ['一', '二', '三', '人', '大', '上', '下', '口']) assert.equal(kanjiInfo(k)?.level, 1, k);
  });

  test('kanjiInfo gives meaning and readings', () => {
    const info = kanjiInfo('人')!;
    assert.equal(info.kanji, '人');
    assert.match(info.meaning, /Person/i);
    assert.match(info.on, /じん/);
    assert.match(info.kun, /ひと/);
    assert.equal(kanjiInfo('a'), undefined);
  });

  test("no meaning or reading keeps the dataset's answer markers", () => {
    assert.equal(kanjiInfo('大')!.meaning, 'Big, Large');
    for (const [k] of rows as [string][]) {
      const { meaning, on, kun } = kanjiInfo(k)!;
      for (const item of [...meaning.split(','), ...on.split('、'), ...kun.split('、')]) assert.doesNotMatch(item.trim(), /^[\^!]/, `${k}: ${item}`);
    }
  });
});

describe('isKanji', () => {
  test('recognises kanji and nothing else', () => {
    for (const ch of ['日', '語', '薔', '㐀']) assert.ok(isKanji(ch), ch);
    for (const ch of ['あ', 'ア', 'a', '1', '。', '々', 'ー']) assert.ok(!isKanji(ch), ch);
  });
});

describe('allowedKanji and isAllowed', () => {
  test('level 0 allows none and level 60 allows the whole list', () => {
    assert.equal(allowedKanji(0).length, 0);
    assert.equal(allowedKanji(60).length, rows.length);
  });

  test('each level adds to the one before', () => {
    let previous = 0;
    for (let level = 1; level <= MAX_WK_LEVEL; level += 1) {
      const n = allowedKanji(level).length;
      assert.ok(n > previous, `level ${level}`);
      previous = n;
    }
  });

  test('a kanji is allowed from its own level on', () => {
    const { level } = kanjiInfo('語')!;
    assert.equal(isAllowed('語', level - 1), false);
    assert.equal(isAllowed('語', level), true);
    assert.equal(isAllowed('語', 60), true);
  });

  test('kanji WaniKani does not teach are never allowed', () => {
    assert.equal(kanjiInfo('薔'), undefined);
    assert.equal(isAllowed('薔', 60), false);
  });
});

describe('stripFurigana', () => {
  test('keeps the base text', () => {
    assert.equal(stripFurigana('{日本語|にほんご}を{話|はな}します'), '日本語を話します');
  });

  test('leaves text without markup, and stray braces, alone', () => {
    assert.equal(stripFurigana('ひらがな'), 'ひらがな');
    assert.equal(stripFurigana('{日本 と }'), '{日本 と }');
    assert.equal(stripFurigana('{|}'), '{|}');
  });

  test('handles an empty reading', () => {
    assert.equal(stripFurigana('{日|}'), '日');
  });
});

describe('kanjiAboveLevel', () => {
  test('finds each kanji above the level once, in order', () => {
    assert.deepEqual(kanjiAboveLevel('{日本語|にほんご}、日本', 1), ['日', '本', '語']);
  });

  test('ignores readings, kana and kanji within the level', () => {
    assert.deepEqual(kanjiAboveLevel('{一|いち}つと{人|ひと}', 1), []);
    assert.deepEqual(kanjiAboveLevel('ひらがなだけ', 0), []);
  });

  test('々 never counts on its own', () => {
    assert.deepEqual(kanjiAboveLevel('{人々|ひとびと}', 1), []);
  });

  test('at level 0 every kanji counts', () => {
    assert.deepEqual(kanjiAboveLevel('人', 0), ['人']);
  });
});

describe('parseWkLevel', () => {
  test('a typed number becomes a whole level within 0..60', () => {
    assert.equal(parseWkLevel('12'), 12);
    assert.equal(parseWkLevel('060'), 60);
    assert.equal(parseWkLevel('2.5'), 3);
    assert.equal(parseWkLevel('0'), 0);
    assert.equal(parseWkLevel('-3'), 0);
    assert.equal(parseWkLevel('75'), MAX_WK_LEVEL);
    // Too big for a number is still above the top level, not "no level".
    assert.equal(parseWkLevel('1e400'), MAX_WK_LEVEL);
    assert.equal(parseWkLevel('-1e400'), 0);
  });

  test('text that is not a number yet is no level, not 0', () => {
    assert.equal(parseWkLevel(''), null);
    assert.equal(parseWkLevel('  '), null);
    assert.equal(parseWkLevel('-'), null);
    assert.equal(parseWkLevel('abc'), null);
  });
});
