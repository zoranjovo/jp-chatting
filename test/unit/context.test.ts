import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { contextOf, modelLabel, settingsFor } from '../../shared/context.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types.ts';

const claude: Settings = { ...DEFAULT_SETTINGS, provider: 'claude', claude: { ...DEFAULT_SETTINGS.claude, model: 'claude-opus-5-5', effort: 'high' }, wkLevel: 12, genkiLesson: 6, jlptLevel: 4 };

describe('message context', () => {
  test('stamps the model, effort, style and levels', () => {
    assert.deepEqual(contextOf(claude, 'casual'), {
      provider: 'claude', model: 'claude-opus-5-5', effort: 'high', politeness: 'casual', wkLevel: 12, genkiLesson: 6, jlptLevel: 4,
    });
  });

  test('the Claude default model is written out, and no effort means none stamped', () => {
    const ctx = contextOf({ ...claude, claude: { ...claude.claude, model: '', effort: '' } }, 'polite');
    assert.equal(ctx.model, DEFAULT_SETTINGS.claude.model);
    assert.ok(!('effort' in ctx));
  });

  test('an endpoint stamps its model and never an effort, whatever the Claude settings say', () => {
    const ctx = contextOf({ ...claude, provider: 'endpoint', endpoint: { ...claude.endpoint, model: 'qwen3' } }, 'polite');
    assert.equal(ctx.model, 'qwen3');
    assert.ok(!('effort' in ctx));
  });

  test('applying a stamp restores what it recorded and keeps the current connection details', () => {
    const now: Settings = {
      ...DEFAULT_SETTINGS,
      provider: 'endpoint',
      endpoint: { baseUrl: 'http://new/v1', apiKey: 'k', model: 'gemma', reasoning: 'high' },
      claude: { command: 'claude2', model: 'claude-haiku-5-5', effort: 'low', timeoutMs: 5 },
      wkLevel: 3,
      uiLanguage: 'ja',
    };
    const s = settingsFor(now, contextOf(claude, 'casual'));
    assert.deepEqual([s.provider, s.claude.model, s.claude.effort, s.wkLevel, s.genkiLesson, s.jlptLevel], ['claude', 'claude-opus-5-5', 'high', 12, 6, 4]);
    assert.deepEqual([s.claude.command, s.claude.timeoutMs, s.endpoint, s.uiLanguage], ['claude2', 5, now.endpoint, 'ja']);
  });

  test('a stamp without effort clears the current one; an endpoint stamp sets only the endpoint model', () => {
    const s = settingsFor(claude, { ...contextOf(claude, 'polite'), effort: undefined });
    assert.equal(s.claude.effort, '');
    const e = settingsFor({ ...claude, endpoint: { baseUrl: 'u', apiKey: '', model: 'now', reasoning: 'high' } }, { ...contextOf(claude, 'polite'), provider: 'endpoint', model: 'then' });
    assert.deepEqual([e.provider, e.endpoint.model, e.endpoint.baseUrl, e.claude.model], ['endpoint', 'then', 'u', 'claude-opus-5-5']);
    assert.equal(e.endpoint.reasoning, 'high', 'a Claude effort level that is also a reasoning level carries over');
  });

  test("an endpoint's thinking setting is stamped as its effort and restored from it", () => {
    const off: Settings = { ...DEFAULT_SETTINGS, provider: 'endpoint', endpoint: { ...DEFAULT_SETTINGS.endpoint, model: 'qwen3', reasoning: 'none' } };
    const ctx = contextOf(off, 'polite');
    assert.equal(ctx.effort, 'none');
    assert.equal(settingsFor({ ...off, endpoint: { ...off.endpoint, reasoning: 'high' } }, ctx).endpoint.reasoning, 'none');
    assert.ok(!('effort' in contextOf({ ...off, endpoint: { ...off.endpoint, reasoning: '' } }, 'polite')), 'the default is not stamped');
    const claude = settingsFor(DEFAULT_SETTINGS, { ...ctx, provider: 'claude', model: 'claude-opus-5-5' });
    assert.equal(claude.claude.effort, '', '"none" is not a Claude effort');
  });

  test('a stamped effort that is no Claude effort at all is the default, not passed to the CLI', () => {
    // As a hand-edited chat file (or a newer version) could have it.
    const stamp = { ...contextOf(claude, 'polite'), effort: 'turbo' as never };
    assert.equal(settingsFor(DEFAULT_SETTINGS, stamp).claude.effort, '');
    assert.equal(settingsFor(DEFAULT_SETTINGS, { ...stamp, effort: 'max' }).claude.effort, 'max');
  });

  test('no stamp leaves the settings as they are', () => {
    assert.equal(settingsFor(claude, undefined), claude);
  });
});

describe('modelLabel', () => {
  test('names Claude models, leaves others alone', () => {
    assert.equal(modelLabel('claude-opus-5-5'), 'Opus 5.5');
    assert.equal(modelLabel('claude-haiku-5-5'), 'Haiku 5.5');
    assert.equal(modelLabel('qwen/qwen3-30b-a3b'), 'qwen/qwen3-30b-a3b');
  });
});
