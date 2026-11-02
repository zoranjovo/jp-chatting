import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { GENKI_GRAMMAR, genkiBook, genkiGrammarThrough, MAX_GENKI_LESSON } from '../../shared/genki.ts';

describe('Genki grammar list', () => {
  test('covers lessons 1-23, each with at least one point', () => {
    assert.equal(MAX_GENKI_LESSON, 23);
    for (let l = 1; l <= MAX_GENKI_LESSON; l += 1) assert.ok(GENKI_GRAMMAR[l]?.length > 0, `lesson ${l}`);
  });

  test('Genki I is lessons 1-12, Genki II 13-23', () => {
    assert.equal(genkiBook(1), 'I');
    assert.equal(genkiBook(12), 'I');
    assert.equal(genkiBook(13), 'II');
    assert.equal(genkiBook(23), 'II');
  });

  test('the cumulative list stops at the lesson', () => {
    const three = genkiGrammarThrough(3).split('\n');
    assert.deepEqual(three.map((l) => l.split(':')[0]), ['L1', 'L2', 'L3']);
    assert.equal(genkiGrammarThrough(0), '');
    assert.equal(genkiGrammarThrough(99).split('\n').length, 23);
  });
});
