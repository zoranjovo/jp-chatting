import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getDraft, prependDraft, setDraft } from '../../src/drafts.ts';

describe('drafts', () => {
  test('are kept per chat, and an empty one is dropped', () => {
    setDraft('a', 'とうきょう');
    setDraft('b', 'おおさか');
    assert.equal(getDraft('a'), 'とうきょう');
    setDraft('a', '');
    assert.equal(getDraft('a'), '');
    assert.equal(getDraft('b'), 'おおさか');
  });

  test('prepending puts the text above what is already typed, with a blank line between', () => {
    prependDraft('c', 'one');
    assert.equal(getDraft('c'), 'one');
    prependDraft('c', 'two');
    assert.equal(getDraft('c'), 'two\n\none');
    setDraft('d', '  ');
    prependDraft('d', 'three');
    assert.equal(getDraft('d'), 'three');
  });
});
