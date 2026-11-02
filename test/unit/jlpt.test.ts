import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { asJlptLevel, JLPT_DESCRIPTION, JLPT_LEVELS } from '../../shared/jlpt.ts';

describe('JLPT levels', () => {
  test('run N5 (easiest) to N1, each described', () => {
    assert.deepEqual(JLPT_LEVELS, [5, 4, 3, 2, 1]);
    for (const level of JLPT_LEVELS) assert.ok(JLPT_DESCRIPTION[level].length > 20, `N${level}`);
  });

  test('describe reading, not listening -- the chat is text', () => {
    for (const level of JLPT_LEVELS) assert.doesNotMatch(JLPT_DESCRIPTION[level], /spoken|slowly|speed/, `N${level}`);
  });

  test('anything but 1-5 reads as not set', () => {
    for (const v of [1, 3, 5, '2', 4.2]) assert.ok(asJlptLevel(v) >= 1);
    for (const v of [0, 6, -1, 'N3', null, undefined]) assert.equal(asJlptLevel(v), 0, String(v));
  });
});
