import type { ModelList, ProviderKind, Settings } from '../../shared/types.ts';
import { callClaude, CLAUDE_MODELS } from './claude.ts';
import { callEndpoint, listEndpointModels } from './endpoint.ts';
import type { AiRequest } from './types.ts';

export { AiError } from './types.ts';
export type { AiRequest, ChatTurn } from './types.ts';

export function callAi(request: AiRequest, settings: Settings): Promise<unknown> {
  return settings.provider === 'claude' ? callClaude(request, settings.claude) : callEndpoint(request, settings.endpoint);
}

export async function listModels(provider: ProviderKind, endpoint: Settings['endpoint']): Promise<ModelList> {
  if (provider === 'claude') return { models: CLAUDE_MODELS };
  try {
    return { models: await listEndpointModels(endpoint) };
  } catch (err) {
    return { models: [], error: (err as Error).message };
  }
}
