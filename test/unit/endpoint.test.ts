import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { callEndpoint, listEndpointModels } from '../../server/ai/endpoint.ts';
import { DEFAULT_SETTINGS } from '../../shared/types.ts';
import { chatCompletion, mockServer, type RecordedRequest } from './helpers.ts';

type Reply = { status?: number; body: unknown };
let next: (req: RecordedRequest) => Reply = () => ({ body: {} });
const server = await mockServer((req) => next(req));
after(() => server.close());

const config = (patch: Partial<typeof DEFAULT_SETTINGS.endpoint> = {}) => ({ ...DEFAULT_SETTINGS.endpoint, baseUrl: `${server.url}/v1`, model: 'm', ...patch });
const last = () => server.requests.at(-1)!;

describe('listEndpointModels', () => {
  test('lists model ids from /models, sorted', async () => {
    next = () => ({ body: { data: [{ id: 'qwen' }, { id: 'gemma' }, {}] } });
    assert.deepEqual(await listEndpointModels(config()), ['gemma', 'qwen']);
    assert.equal(last().url, '/v1/models');
  });

  test('tolerates a trailing slash on the URL', async () => {
    next = () => ({ body: { data: [] } });
    await listEndpointModels(config({ baseUrl: `${server.url}/v1///` }));
    assert.equal(last().url, '/v1/models');
  });

  test('sends the API key as a bearer token only when set', async () => {
    next = () => ({ body: { data: [] } });
    await listEndpointModels(config());
    assert.equal(last().headers.authorization, undefined);
    await listEndpointModels(config({ apiKey: '  key123 ' }));
    assert.equal(last().headers.authorization, 'Bearer key123');
  });

  test('reports an error status', async () => {
    next = () => ({ status: 401, body: { error: 'bad key' } });
    await assert.rejects(listEndpointModels(config()), /answered 401.*bad key/);
  });

  test('reports an unreachable server', async () => {
    await assert.rejects(listEndpointModels(config({ baseUrl: 'http://127.0.0.1:9/v1' })), /could not reach/);
  });

  test('refuses an empty URL', async () => {
    await assert.rejects(listEndpointModels(config({ baseUrl: '  ' })), /no endpoint URL/);
  });
});

describe('callEndpoint', () => {
  const request = { system: 'SYS', turns: [{ role: 'user' as const, content: 'やあ' }] };

  test('refuses to run without a model', async () => {
    await assert.rejects(callEndpoint(request, config({ model: '' })), /no model chosen/);
  });

  test('posts the system prompt and turns, and returns the text', async () => {
    next = () => ({ body: chatCompletion('こんにちは！') });
    assert.equal(await callEndpoint(request, config()), 'こんにちは！');
    const body = last().body;
    assert.equal(last().url, '/v1/chat/completions');
    assert.equal(body.model, 'm');
    assert.deepEqual(body.messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'やあ' }]);
    assert.equal(body.response_format, undefined);
  });

  test('strips a reasoning model\'s <think> block', async () => {
    next = () => ({ body: chatCompletion('<think>\nthe user said hi\n</think>\n\nこんにちは') });
    assert.equal(await callEndpoint(request, config()), 'こんにちは');
  });

  test('asks for json_schema output and parses the JSON', async () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    next = () => ({ body: chatCompletion('```json\n{"a":"b"}\n```') });
    assert.deepEqual(await callEndpoint({ ...request, schema }, config()), { a: 'b' });
    assert.deepEqual(last().body.response_format, { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema } });
  });

  test('retries without response_format when the server rejects it', async () => {
    const schema = { type: 'object' };
    next = (req) => (req.body.response_format ? { status: 400, body: { error: 'unsupported' } } : { body: chatCompletion('{"ok":true}') });
    const before = server.requests.length;
    assert.deepEqual(await callEndpoint({ ...request, schema }, config()), { ok: true });
    assert.equal(server.requests.length - before, 2);
    assert.equal(last().body.response_format, undefined);
  });

  test('does not retry a server error', async () => {
    next = () => ({ status: 500, body: { error: 'model crashed' } });
    const before = server.requests.length;
    await assert.rejects(callEndpoint({ ...request, schema: { type: 'object' } }, config()), /answered 500.*model crashed/);
    assert.equal(server.requests.length - before, 1);
  });

  test('an empty reply is an error', async () => {
    next = () => ({ body: chatCompletion('   ') });
    await assert.rejects(callEndpoint(request, config()), /empty reply/);
    next = () => ({ body: { choices: [] } });
    await assert.rejects(callEndpoint(request, config()), /empty reply/);
  });

  test('an answer filed under reasoning_content with empty content is used, when the reply finished', async () => {
    const reply = (finish: string) => ({ choices: [{ message: { role: 'assistant', content: '', reasoning_content: 'こんにちは！' }, finish_reason: finish }] });
    next = () => ({ body: reply('stop') });
    assert.equal(await callEndpoint(request, config()), 'こんにちは！');
    next = () => ({ body: reply('length') });
    await assert.rejects(callEndpoint(request, config()), /empty reply/, 'cut off mid-thought is not an answer');
    next = () => ({ body: { choices: [{ message: { content: 'ほんとう', reasoning_content: 'thinking…' }, finish_reason: 'stop' }] } });
    assert.equal(await callEndpoint(request, config()), 'ほんとう', 'real content wins');
  });

  test('a schema reply that is not JSON is an error', async () => {
    next = () => ({ body: chatCompletion('Sorry, I cannot help.') });
    await assert.rejects(callEndpoint({ ...request, schema: { type: 'object' } }, config()), /did not return valid JSON/);
  });

  test('uses a lower temperature for structured answers', async () => {
    next = () => ({ body: chatCompletion('{}') });
    await callEndpoint({ ...request, schema: { type: 'object' } }, config());
    const structured = last().body.temperature;
    next = () => ({ body: chatCompletion('hi') });
    await callEndpoint(request, config());
    assert.ok(structured < last().body.temperature);
  });

  test('sends the thinking setting as reasoning_effort, and nothing for the model default', async () => {
    next = () => ({ body: chatCompletion('hi') });
    await callEndpoint(request, config());
    assert.ok(!('reasoning_effort' in last().body));
    await callEndpoint(request, config({ reasoning: 'none' }));
    assert.equal(last().body.reasoning_effort, 'none');
    next = () => ({ body: chatCompletion('{}') });
    await callEndpoint({ ...request, schema: { type: 'object' } }, config({ reasoning: 'high' }));
    assert.equal(last().body.reasoning_effort, 'high');
  });
});
