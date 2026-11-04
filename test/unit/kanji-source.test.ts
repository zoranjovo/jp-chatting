import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hasMarkers, toRow, wkAnswers } from '../../scripts/kanji-source.ts';

describe('wkAnswers', () => {
  test('drops the "^" (not primary) and "!" (not accepted) markers', () => {
    assert.deepEqual(wkAnswers(['Big', '^Large']), ['Big', 'Large']);
    assert.deepEqual(wkAnswers(['しょう', '!か']), ['しょう', 'か']);
  });

  test('lists primary answers first, then other accepted ones, then the rest, keeping order within each', () => {
    assert.deepEqual(wkAnswers(['^う', 'ゆう']), ['ゆう', 'う']);
    assert.deepEqual(wkAnswers(['!a', '^b', 'c', '!d', '^e', 'f']), ['c', 'f', 'b', 'e', 'a', 'd']);
  });

  test('keeps a marker-like character that is the whole answer, and drops empty ones', () => {
    assert.deepEqual(wkAnswers(['Question Mark', '^?']), ['Question Mark', '?']);
    assert.deepEqual(wkAnswers(['^', '!', '']), []);
    assert.deepEqual(wkAnswers(null), []);
  });

  test('trims before reading the marker', () => {
    assert.deepEqual(wkAnswers([' ^Large', 'Big ']), ['Big', 'Large']);
  });
});

describe('toRow', () => {
  test('builds a clean row: two meanings, readings joined with 、', () => {
    assert.deepEqual(
      toRow('平', { wk_level: 4, wk_meanings: ['Flat', '^Peace', '^Calm'], wk_readings_on: ['へい', '^ひょう', '^びょう'], wk_readings_kun: ['!たいら', 'ひら'] }),
      ['平', 4, 'Flat, Peace', 'へい、ひょう、びょう', 'ひら、たいら'],
    );
  });

  test('falls back to the general meanings, and skips kanji WaniKani does not teach', () => {
    assert.deepEqual(toRow('X', { wk_level: 60, meanings: ['One', 'Two', 'Three'] }), ['X', 60, 'One, Two', '', '']);
    assert.equal(toRow('薔', { wk_level: null, meanings: ['Rose'] }), undefined);
  });

  test('an empty WaniKani meaning list falls back too, and the fallback is cleaned up the same way', () => {
    assert.deepEqual(toRow('X', { wk_level: 5, wk_meanings: [], meanings: [' One ', '', 'Two'] }), ['X', 5, 'One, Two', '', '']);
  });
});

describe('hasMarkers', () => {
  test('finds a marker on any meaning or reading, so --if-missing rebuilds a file from before markers were dropped', () => {
    assert.equal(hasMarkers(['大', 1, 'Big, ^Large', 'たい、だい', 'おお']), true);
    assert.equal(hasMarkers(['小', 1, 'Small', 'しょう', 'ちい、!こ']), true);
    assert.equal(hasMarkers(['大', 1, 'Big, Large', 'たい、だい', 'おお']), false);
  });
});
