import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { billingProblem, callClaude, claudeArgs, claudeEnv, CLAUDE_MODELS, isClaudeCommand, promptOf } from '../../server/ai/claude.ts';
import type { AiRequest } from '../../server/ai/types.ts';
import { DEFAULT_SETTINGS } from '../../shared/types.ts';
import { fakeSpawn, INIT_OK, resultEvent } from './helpers.ts';

const config = { ...DEFAULT_SETTINGS.claude, model: 'haiku', effort: '' as const, timeoutMs: 5_000 };
const textRequest: AiRequest = { system: 'SYSTEM PROMPT', turns: [{ role: 'user', content: 'こんにちは' }] };
const schemaRequest: AiRequest = { ...textRequest, schema: { type: 'object', properties: { a: { type: 'string' } } } };

const flag = (args: string[], name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

describe('claudeArgs', () => {
  test('runs headless with stream-json and every customisation off', () => {
    const args = claudeArgs(textRequest, config, 'sys.txt');
    assert.equal(args[0], '-p');
    assert.equal(flag(args, '--model'), 'haiku');
    assert.equal(flag(args, '--output-format'), 'stream-json');
    assert.equal(flag(args, '--tools'), '');
    assert.equal(flag(args, '--setting-sources'), '');
    assert.equal(flag(args, '--mcp-config'), '{"mcpServers":{}}');
    assert.equal(flag(args, '--system-prompt-file'), 'sys.txt');
    assert.equal(flag(args, '--permission-mode'), 'dontAsk');
    for (const f of ['--verbose', '--safe-mode', '--strict-mcp-config', '--disable-slash-commands', '--no-chrome', '--no-session-persistence']) {
      assert.ok(args.includes(f), f);
    }
  });

  test('never uses --bare, which only takes API keys', () => {
    assert.ok(!claudeArgs(textRequest, config, 's').includes('--bare'));
  });

  test('a text request gets one turn and no schema', () => {
    const args = claudeArgs(textRequest, config, 's');
    assert.equal(flag(args, '--max-turns'), '1');
    assert.ok(!args.includes('--json-schema'));
  });

  test('a schema request passes the schema and room for the StructuredOutput turn', () => {
    const args = claudeArgs(schemaRequest, config, 's');
    assert.equal(flag(args, '--max-turns'), '3');
    assert.deepEqual(JSON.parse(flag(args, '--json-schema')!), schemaRequest.schema);
  });

  test('effort is passed only when set', () => {
    assert.ok(!claudeArgs(textRequest, config, 's').includes('--effort'));
    assert.equal(flag(claudeArgs(textRequest, { ...config, effort: 'low' }, 's'), '--effort'), 'low');
  });

  test('an empty model falls back to the default model', () => {
    assert.equal(flag(claudeArgs(textRequest, { ...config, model: '' }, 's'), '--model'), DEFAULT_SETTINGS.claude.model);
  });
});

describe('claudeEnv', () => {
  const env = claudeEnv({
    PATH: '/bin',
    HOME: '/home/x',
    ANTHROPIC_API_KEY: 'sk-x',
    ANTHROPIC_BASE_URL: 'https://proxy',
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: '1',
    CLAUDE_CODE_ENTRYPOINT: 'desktop',
    CLAUDECODE: '1',
    CLAUDE_CONFIG_DIR: '/cfg',
  });

  test('strips every API-key, provider and parent-session variable', () => {
    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDECODE']) {
      assert.equal(env[key], undefined, key);
    }
  });

  test('keeps everything else, and the config dir', () => {
    assert.equal(env.PATH, '/bin');
    assert.equal(env.HOME, '/home/x');
    assert.equal(env.CLAUDE_CONFIG_DIR, '/cfg');
  });

  test('turns off non-essential traffic', () => {
    assert.equal(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1');
  });
});

describe('promptOf', () => {
  test('a single turn is sent as is', () => {
    assert.equal(promptOf(textRequest), 'こんにちは');
  });

  test('a longer history is written out as a transcript ending with the learner', () => {
    const prompt = promptOf({
      system: '',
      turns: [
        { role: 'user', content: 'CUE' },
        { role: 'assistant', content: 'いらっしゃいませ' },
        { role: 'user', content: 'コーヒーをください' },
      ],
    });
    assert.match(prompt, /^The conversation so far:/);
    assert.match(prompt, /Learner: CUE\n\nYou: いらっしゃいませ/);
    assert.match(prompt, /Learner: コーヒーをください$/);
  });
});

describe('billingProblem', () => {
  test('a claude.ai sign-in within limits is fine', () => {
    assert.equal(billingProblem('none', null), null);
    assert.equal(billingProblem(null, null), null);
    assert.equal(billingProblem('none', { status: 'allowed' }), null);
    assert.equal(billingProblem('none', { status: 'allowed_warning' }), null);
  });

  test('an API key is refused', () => {
    assert.match(billingProblem('ANTHROPIC_API_KEY', null)!, /API key/);
  });

  test('extra usage is refused', () => {
    assert.match(billingProblem('none', { status: 'allowed', isUsingOverage: true })!, /extra usage/);
  });

  test('a reached limit is refused, with the reset time when known', () => {
    assert.match(billingProblem('none', { status: 'rejected' })!, /limit is reached/);
    assert.match(billingProblem('none', { status: 'rejected', resetsAt: 1_800_000_000 })!, /resets/);
  });
});

describe('callClaude', () => {
  test('returns the text result, sends the prompt on stdin and the system prompt as a file', async () => {
    const fake = fakeSpawn({ events: [INIT_OK, resultEvent({ result: '  はい、こんにちは！ ' })] });
    const out = await callClaude(textRequest, config, fake.spawn);
    assert.equal(out, 'はい、こんにちは！');
    const [run] = fake.runs;
    assert.equal(run.command, 'claude');
    assert.equal(run.stdin, 'こんにちは');
    assert.equal(run.systemPrompt, 'SYSTEM PROMPT');
    assert.equal(fs.existsSync(run.systemPromptFile!), false, 'system prompt file is removed afterwards');
    assert.equal(path.basename(String(run.options.cwd)), 'claude');
    assert.equal((run.options.env as NodeJS.ProcessEnv).CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1');
  });

  test('uses the configured command', async () => {
    const fake = fakeSpawn({ events: [INIT_OK, resultEvent({ result: 'ok' })] });
    await callClaude(textRequest, { ...config, command: 'C:/tools/claude.exe' }, fake.spawn);
    assert.equal(fake.runs[0].command, 'C:/tools/claude.exe');
  });

  test('refuses to run anything but a claude executable', async () => {
    for (const command of ['cmd.exe', 'C:\\Windows\\System32\\powershell.exe', '/bin/sh', 'claude-evil', 'C:/x/claude.exe/../calc.exe']) {
      const fake = fakeSpawn({ events: [INIT_OK, resultEvent({ result: 'ok' })] });
      await assert.rejects(callClaude(textRequest, { ...config, command }, fake.spawn), /not the claude executable/, command);
      assert.equal(fake.runs.length, 0, command);
    }
    for (const command of ['claude', 'CLAUDE.EXE', 'C:\\Users\\me\\.local\\bin\\claude.exe', '/usr/local/bin/claude', '']) {
      assert.ok(isClaudeCommand(command || 'claude'), command);
    }
  });

  test('returns structured_output for a schema request', async () => {
    const fake = fakeSpawn({ events: [INIT_OK, resultEvent({ result: '', structured_output: { a: 'b' } })] });
    assert.deepEqual(await callClaude(schemaRequest, config, fake.spawn), { a: 'b' });
  });

  test('a schema request without structured output fails, quoting what it said instead', async () => {
    const fake = fakeSpawn({ events: [INIT_OK, resultEvent({ result: 'I cannot do that' })] });
    await assert.rejects(callClaude(schemaRequest, config, fake.spawn), /no structured output: "I cannot do that"/);
  });

  test('ignores lines that are not JSON', async () => {
    const fake = fakeSpawn({ events: ['Loading…', INIT_OK, '{broken', resultEvent({ result: 'ok' })] });
    assert.equal(await callClaude(textRequest, config, fake.spawn), 'ok');
  });

  test('a result split across stdout chunks still parses', async () => {
    const long = 'あ'.repeat(70_000);
    const fake = fakeSpawn({ events: [INIT_OK, resultEvent({ result: long })] });
    assert.equal(await callClaude(textRequest, config, fake.spawn), long);
  });

  test('an auth failure says how to sign in', async () => {
    const fake = fakeSpawn({
      events: [INIT_OK, resultEvent({ is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed' })],
    });
    await assert.rejects(callClaude(textRequest, config, fake.spawn), /OAuth session expired.*claude auth login/);
  });

  test('an error result reports its subtype when there is no text', async () => {
    const fake = fakeSpawn({ events: [INIT_OK, resultEvent({ subtype: 'error_max_turns', is_error: true, result: '' })] });
    await assert.rejects(callClaude(textRequest, config, fake.spawn), /error_max_turns/);
  });

  test('a run on an API key is killed before it answers', async () => {
    const fake = fakeSpawn({ events: [{ ...INIT_OK, apiKeySource: 'ANTHROPIC_API_KEY' }, resultEvent({ result: 'should never be seen' })] });
    await assert.rejects(callClaude(textRequest, config, fake.spawn), /API key/);
    assert.equal(fake.runs[0].killed, true);
  });

  test('a run that would use extra usage is killed', async () => {
    const fake = fakeSpawn({
      events: [INIT_OK, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', isUsingOverage: true } }, resultEvent({ result: 'x' })],
    });
    await assert.rejects(callClaude(textRequest, config, fake.spawn), /extra usage/);
    assert.equal(fake.runs[0].killed, true);
  });

  test('a missing executable is reported', async () => {
    const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    const fake = fakeSpawn({ error: err });
    await assert.rejects(callClaude(textRequest, config, fake.spawn), /could not run "claude": spawn claude ENOENT/);
  });

  test('a run that exits without a result reports stderr', async () => {
    const fake = fakeSpawn({ events: [INIT_OK], stderr: 'Error: unknown option --frobnicate' });
    await assert.rejects(callClaude(textRequest, config, fake.spawn), /unknown option --frobnicate/);
  });

  test('a run that exits silently says so', async () => {
    const fake = fakeSpawn({ events: [] });
    await assert.rejects(callClaude(textRequest, config, fake.spawn), /exited without a result/);
  });

  test('a run that hangs is killed at the timeout', async () => {
    const fake = fakeSpawn({ events: [INIT_OK], hang: true });
    await assert.rejects(callClaude(textRequest, { ...config, timeoutMs: 50 }, fake.spawn), /timed out/);
    assert.equal(fake.runs[0].killed, true);
  });
});

describe('CLAUDE_MODELS', () => {
  test('lists distinct, non-empty model names', () => {
    assert.ok(CLAUDE_MODELS.length > 0);
    assert.equal(new Set(CLAUDE_MODELS).size, CLAUDE_MODELS.length);
    for (const m of CLAUDE_MODELS) assert.match(m, /^[a-z0-9-]+$/);
  });

  test('the default model is in the list', () => {
    assert.ok(CLAUDE_MODELS.includes(DEFAULT_SETTINGS.claude.model));
  });
});

describe('the offered models', () => {
  test('are exactly Haiku, Sonnet and Opus 5.5, by full id', () => {
    assert.deepEqual(CLAUDE_MODELS, ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
  });
});
