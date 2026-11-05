import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DRAFT_SAVE_MS, getDraft, prependDraft, replaceDraft, seedDraft, setDraft, setDraftSaver, takeDraft } from '../../src/drafts.ts';

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

  test('the learner\'s edits are saved once typing pauses, once, with the latest text', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const saved: [string, string][] = [];
    setDraftSaver((id, text) => saved.push([id, text]));
    setDraft('e', 'と');
    t.mock.timers.tick(DRAFT_SAVE_MS - 1);
    setDraft('e', 'とう');
    t.mock.timers.tick(DRAFT_SAVE_MS - 1);
    assert.deepEqual(saved, []);
    t.mock.timers.tick(1);
    assert.deepEqual(saved, [['e', 'とう']]);
    setDraftSaver(() => {});
  });

  test('text the server decided, or that a request takes along, is not saved again', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const saved: string[] = [];
    setDraftSaver((_id, text) => saved.push(text));
    setDraft('f', 'typed');
    assert.equal(takeDraft('f'), 'typed');
    replaceDraft('f', 'from the server');
    t.mock.timers.tick(DRAFT_SAVE_MS * 2);
    assert.deepEqual(saved, []);
    assert.equal(getDraft('f'), 'from the server');
    setDraftSaver(() => {});
  });

  test('a chat\'s saved draft is taken in once, and never over newer typing', () => {
    seedDraft('g', 'saved');
    assert.equal(getDraft('g'), 'saved');
    replaceDraft('g', 'newer');
    seedDraft('g', 'saved');
    assert.equal(getDraft('g'), 'newer');
    setDraft('h', 'typed first');
    seedDraft('h', 'saved');
    assert.equal(getDraft('h'), 'typed first');
  });
});
