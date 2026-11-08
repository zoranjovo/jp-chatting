export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  system: string;
  turns: ChatTurn[];
  /** When set, the answer must be JSON matching this schema. */
  schema?: Record<string, unknown>;
  /** In place of the provider's own time limit: what is left of a reply's budget. */
  timeoutMs?: number;
}

/** Returns the reply text, or for a schema request, the parsed JSON. */
export type AiCall = (request: AiRequest) => Promise<unknown>;

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiError';
  }
}

/** Pulls the JSON object out of a reply that may wrap it in prose or a code fence. */
export function parseJsonReply(text: string): unknown {
  const cleaned = stripThinking(text).trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new AiError(`the model did not return valid JSON: ${cleaned.slice(0, 300)}`);
  }
}

/** Reasoning models served locally often leave their <think> block in the content. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '').trim();
}
