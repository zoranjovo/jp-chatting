import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LIMIT_TALK } from '../../scripts/eval-prompts.ts';

describe('LIMIT_TALK', () => {
  test('catches feedback that blames the spelling on the kanji limit', () => {
    for (const text of [
      '語彙力 is only written in kana here because of the kanji limit.',
      'This kanji is above your WaniKani level.',
      'I kept it in hiragana because you may not know the kanji yet.',
      'It is just spelled in kana for you.',
    ]) {
      assert.match(text, LIMIT_TALK, text);
    }
  });

  test('leaves ordinary explanations of kana alone', () => {
    for (const text of ['The particle は is written in hiragana and read "wa".', 'Okurigana are written in hiragana after the kanji.']) {
      assert.doesNotMatch(text, LIMIT_TALK, text);
    }
  });
});
