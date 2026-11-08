import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { AiRequest } from '../../server/ai/index.ts';
import { ENDPOINT_TIMEOUT_MS } from '../../server/ai/endpoint.ts';
import { generateReply, replyBudgetMs, type CallAi } from '../../server/generate.ts';
import { DEFAULT_SETTINGS, type Chat, type ReplyStep, type Settings } from '../../shared/types.ts';

const settings: Settings = { ...DEFAULT_SETTINGS, wkLevel: 1 };
const chat: Pick<Chat, 'topic' | 'politeness' | 'messages'> = { topic: '', politeness: 'polite', messages: [] };
const isRewrite = (r: AiRequest) => r.system.startsWith('You edit Japanese');

/** A model that always breaks the kanji rule, so every fix-up step is tried; each call takes `takesMs` on the fake clock. */
function slowModel(takesMs: number) {
  let clock = 0;
  const timeouts: number[] = [];
  const kinds: string[] = [];
  const callAi: CallAi = async (request) => {
    timeouts.push(request.timeoutMs!);
    kinds.push(isRewrite(request) ? 'rewrite' : 'draft');
    clock += takesMs;
    return '話します';
  };
  return { callAi, now: () => clock, timeouts, kinds };
}

describe('generateReply and its time limit', () => {
  test('each call gets what is left of the reply\'s time, and every step is reported', async () => {
    const model = slowModel(20_000);
    const steps: ReplyStep[] = [];
    await generateReply(model.callAi, settings, chat, { budgetMs: 100_000, now: model.now, onStep: (s) => steps.push(s) });
    assert.deepEqual(model.kinds, ['draft', 'rewrite', 'draft']);
    assert.deepEqual(model.timeouts, [100_000, 80_000, 60_000]);
    assert.deepEqual(steps, ['draft', 'rewrite', 'fresh']);
  });

  test('a fix-up step with too little time left is skipped, and the best draft so far is kept', async () => {
    const model = slowModel(55_000);
    const steps: ReplyStep[] = [];
    const reply = await generateReply(model.callAi, settings, chat, { budgetMs: 115_000, now: model.now, onStep: (s) => steps.push(s) });
    // 60 s left after the draft: room for the rewrite; 5 s after it, under the 10 s a step needs.
    assert.deepEqual(model.kinds, ['draft', 'rewrite']);
    assert.deepEqual(steps, ['draft', 'rewrite']);
    assert.equal(reply, '話します');
  });

  test('the time limit is the Claude CLI timeout, or the endpoint\'s request timeout', () => {
    assert.equal(replyBudgetMs({ ...DEFAULT_SETTINGS, provider: 'claude' }), DEFAULT_SETTINGS.claude.timeoutMs);
    assert.equal(replyBudgetMs({ ...DEFAULT_SETTINGS, provider: 'endpoint' }), ENDPOINT_TIMEOUT_MS);
  });
});
