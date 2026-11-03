// The settings stamped on each message (MessageContext), and applying a stamp
// back over the current settings when a message is analysed later.

import { DEFAULT_SETTINGS, ENDPOINT_REASONING, type ClaudeEffort, type EndpointReasoning, type MessageContext, type Politeness, type Settings } from './types.ts';

/** What a message is stamped with. The Claude model is resolved, since an empty one means the default. */
export function contextOf(settings: Settings, politeness: Politeness): MessageContext {
  const claude = settings.provider === 'claude';
  return {
    provider: settings.provider,
    model: claude ? settings.claude.model || DEFAULT_SETTINGS.claude.model : settings.endpoint.model,
    ...(claude && settings.claude.effort ? { effort: settings.claude.effort } : {}),
    ...(!claude && settings.endpoint.reasoning ? { effort: settings.endpoint.reasoning } : {}),
    politeness,
    wkLevel: settings.wkLevel,
    genkiLesson: settings.genkiLesson,
    jlptLevel: settings.jlptLevel,
  };
}

/**
 * The settings to analyse a message with: its stamp over the current settings.
 * Connection details (endpoint URL, key, CLI command, timeout) stay current.
 */
export function settingsFor(settings: Settings, context: MessageContext | undefined): Settings {
  if (!context) return settings;
  const { provider, model, effort, wkLevel, genkiLesson, jlptLevel } = context;
  return {
    ...settings,
    provider,
    wkLevel,
    genkiLesson,
    jlptLevel,
    endpoint: provider === 'endpoint' ? { ...settings.endpoint, model, reasoning: asReasoning(effort) } : settings.endpoint,
    claude: provider === 'claude' ? { ...settings.claude, model, effort: asEffort(effort) } : settings.claude,
  };
}

const asReasoning = (e: string | undefined): EndpointReasoning => (ENDPOINT_REASONING.includes(e as EndpointReasoning) ? (e as EndpointReasoning) : '');
const asEffort = (e: string | undefined): ClaudeEffort => (e && e !== 'none' ? (e as ClaudeEffort) : '');

/** "claude-opus-5-5" → "Opus 5.5"; endpoint model names as they are. */
export function modelLabel(model: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(model);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : model;
}
