// Tries every model in CLAUDE_MODELS (or the ones named as arguments) with a
// plain chat call and a structured-output call, through the same runner the
// app uses. Needs the CLI signed in: `claude auth login`.
//
//   pnpm check:claude                 # every listed model
//   pnpm check:claude haiku opus      # just these

import { callClaude, CLAUDE_MODELS } from '../server/ai/claude.ts';
import { DEFAULT_SETTINGS } from '../shared/types.ts';

const models = process.argv.slice(2).length > 0 ? process.argv.slice(2) : CLAUDE_MODELS;
const config = { ...DEFAULT_SETTINGS.claude, timeoutMs: 120_000 };
const schema = {
  type: 'object',
  properties: { word: { type: 'string' } },
  required: ['word'],
  additionalProperties: false,
};

let failed = 0;
for (const model of models) {
  const started = Date.now();
  try {
    const text = await callClaude(
      { system: 'Answer in Japanese only, in one short sentence.', turns: [{ role: 'user', content: 'こんにちは！' }] },
      { ...config, model },
    );
    const json = (await callClaude(
      { system: 'You answer with structured output.', turns: [{ role: 'user', content: 'Give the Japanese word for "cat" in hiragana.' }], schema },
      { ...config, model },
    )) as { word?: unknown };
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty text reply');
    if (typeof json?.word !== 'string') throw new Error(`bad structured output: ${JSON.stringify(json)}`);
    console.log(`ok    ${model.padEnd(20)} ${((Date.now() - started) / 1000).toFixed(1)}s  "${text.slice(0, 40)}" / ${json.word}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${model.padEnd(20)} ${(err as Error).message}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
