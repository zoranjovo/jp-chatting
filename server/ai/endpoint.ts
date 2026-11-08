// An OpenAI-compatible chat completions endpoint: LM Studio, Ollama, llama.cpp,
// vLLM, OpenRouter, OpenAI itself...

import { needsModel, type Settings } from '../../shared/types.ts';
import { AiError, parseJsonReply, stripThinking, type AiRequest } from './types.ts';

type EndpointConfig = Settings['endpoint'];

function base(config: EndpointConfig): string {
  return config.baseUrl.trim().replace(/\/+$/, '');
}

function headers(config: EndpointConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(config.apiKey.trim() ? { Authorization: `Bearer ${config.apiKey.trim()}` } : {}),
  };
}

export async function listEndpointModels(config: EndpointConfig): Promise<string[]> {
  if (!base(config)) throw new AiError('no endpoint URL set');
  let res: Response;
  try {
    res = await fetch(`${base(config)}/models`, { headers: headers(config), signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new AiError(`could not reach ${base(config)}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new AiError(`${base(config)}/models answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: { id?: string }[] };
  return (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id).sort();
}

/** How long one request may take, and a reply in all (generateReply). */
export const ENDPOINT_TIMEOUT_MS = 300_000;

async function post(config: EndpointConfig, body: Record<string, unknown>, timeoutMs = ENDPOINT_TIMEOUT_MS): Promise<Response> {
  try {
    return await fetch(`${base(config)}/chat/completions`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AiError(`could not reach ${base(config)}: ${(err as Error).message}`);
  }
}

export async function callEndpoint(request: AiRequest, config: EndpointConfig): Promise<unknown> {
  if (needsModel({ provider: 'endpoint', endpoint: config })) throw new AiError('no model chosen for the endpoint -- pick one in Settings');
  const body: Record<string, unknown> = {
    model: config.model,
    messages: [{ role: 'system', content: request.system }, ...request.turns],
    temperature: request.schema ? 0.3 : 0.8,
    ...(config.reasoning ? { reasoning_effort: config.reasoning } : {}),
  };
  if (request.schema) {
    body.response_format = { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: request.schema } };
  }

  let res = await post(config, body, request.timeoutMs);
  // Not every server takes json_schema; the prompt asks for JSON anyway.
  if (!res.ok && request.schema && res.status >= 400 && res.status < 500) {
    delete body.response_format;
    res = await post(config, body, request.timeoutMs);
  }
  if (!res.ok) throw new AiError(`the endpoint answered ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string; reasoning_content?: string }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  let text = choice?.message?.content ?? '';
  // LM Studio can misread a model as a thinking one and file its whole answer under reasoning_content,
  // leaving content empty (seen with Qwen3 4B 2507). A reply that finished with nothing else is that answer.
  if (!text.trim() && choice?.finish_reason === 'stop') text = choice.message?.reasoning_content ?? '';
  if (!text.trim()) throw new AiError('the endpoint returned an empty reply');
  return request.schema ? parseJsonReply(text) : stripThinking(text);
}
