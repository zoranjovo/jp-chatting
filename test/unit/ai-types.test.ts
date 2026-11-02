import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AiError, parseJsonReply, stripThinking } from '../../server/ai/types.ts';

describe('stripThinking', () => {
  test('removes <think> blocks', () => {
    assert.equal(stripThinking('<think>hmm</think>答え'), '答え');
    assert.equal(stripThinking('<think>a</think>x<think>b</think>y'), 'xy');
  });

  test('removes a block whose opening tag the server already dropped', () => {
    assert.equal(stripThinking('reasoning here</think>\n答え'), '答え');
  });

  test('leaves plain text alone', () => {
    assert.equal(stripThinking('  こんにちは  '), 'こんにちは');
  });
});

describe('parseJsonReply', () => {
  test('parses plain JSON', () => {
    assert.deepEqual(parseJsonReply('{"a":1}'), { a: 1 });
  });

  test('parses JSON inside a code fence or prose', () => {
    assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonReply('Here you go: {"a":{"b":[1,2]}} Hope it helps!'), { a: { b: [1, 2] } });
  });

  test('parses JSON after a think block', () => {
    assert.deepEqual(parseJsonReply('<think>{"not":"this"}</think>{"a":1}'), { a: 1 });
  });

  test('throws an AiError for anything else', () => {
    assert.throws(() => parseJsonReply('no json here'), AiError);
    assert.throws(() => parseJsonReply('{broken'), /did not return valid JSON/);
  });
});
