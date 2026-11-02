import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { STRINGS } from '../../src/i18n.tsx';

const { en, ja } = STRINGS;

/** Every key path with the type of its value: { a: { b: 'x' } } -> ['a.b:string']. */
function shape(value: unknown, at = ''): string[] {
  if (Array.isArray(value)) return [`${at}:array`];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => shape(v, at ? `${at}.${k}` : k));
  return [`${at}:${typeof value}`];
}

function strings(value: unknown, at = ''): [string, string][] {
  if (typeof value === 'string') return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, at ? `${at}.${k}` : k));
  return [];
}

describe('UI strings', () => {
  test('Japanese has exactly the keys and value types English has', () => {
    assert.deepEqual(shape(ja).sort(), shape(en).sort());
  });

  test('no string is empty', () => {
    for (const [lang, dict] of Object.entries(STRINGS)) {
      for (const [key, value] of strings(dict)) assert.ok(value.trim(), `${lang}.${key} is empty`);
    }
  });

  test('topic examples come in the same number', () => {
    assert.equal(ja.topicExamples.length, en.topicExamples.length);
  });

  test('the Japanese UI is actually Japanese', () => {
    const untranslated = strings(ja).filter(([key, v]) => v === strings(en).find(([k]) => k === key)?.[1] && /[a-z]{4,}/i.test(v));
    // Names and URLs are allowed to match.
    const allowed = new Set(['appName', 'providerClaude', 'baseUrlHint']);
    assert.deepEqual(untranslated.filter(([k]) => !allowed.has(k)), []);
  });

  test('the level hint handles kana-only and a range', () => {
    assert.match(en.wkLevelHint(0, 0), /Kana only/);
    assert.match(en.wkLevelHint(5, 166), /166 kanji from levels 1–5/);
    assert.match(ja.wkLevelHint(0, 0), /かなのみ/);
    assert.match(ja.wkLevelHint(5, 166), /レベル1〜5の漢字166字/);
  });

  test('every feedback verdict has a label in both languages', () => {
    for (const v of ['correct', 'minor', 'incorrect', 'english'] as const) {
      assert.ok(en.verdict[v]);
      assert.ok(ja.verdict[v]);
    }
  });
});
