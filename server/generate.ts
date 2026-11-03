// What the AI produces for the app -- the partner's next message, a breakdown,
// feedback -- with the checks and coercion around each call. The API routes
// and scripts/eval-prompts.ts both go through here.

import { autoFix, dropKanaFurigana, problemCount, replyProblems, salvageFromForeign } from '../shared/quality.ts';
import type { Breakdown, Chat, Feedback, Message, Politeness, Settings } from '../shared/types.ts';
import type { AiRequest } from './ai/index.ts';
import {
  BREAKDOWN_SCHEMA,
  breakdownRequest,
  conversationSystem,
  conversationTurns,
  FEEDBACK_SCHEMA,
  feedbackRequest,
  rewriteRequest,
  toBreakdown,
  toFeedback,
} from './prompts.ts';

export type CallAi = (request: AiRequest, settings: Settings) => Promise<unknown>;

/**
 * The partner's next message. What can be fixed without the model is fixed
 * outright (autoFix, and salvageFromForeign for English that leaked in around
 * a clean message). Anything left gets one rewrite request; if even that
 * isn't clean, one fresh reply is drawn. The candidate with the fewest
 * problems wins, earliest first on a tie.
 */
export async function generateReply(callAi: CallAi, settings: Settings, chat: Pick<Chat, 'topic' | 'politeness' | 'messages'>): Promise<string> {
  const level = settings.wkLevel;
  const score = (text: string) => problemCount(replyProblems(text, level));
  const tidy = (raw: unknown) => {
    const text = autoFix(String(raw), level);
    return score(text) > 0 ? (salvageFromForeign(text, level) ?? text) : text;
  };
  const draft = () => callAi({ system: conversationSystem(settings, chat), turns: conversationTurns(chat.messages) }, settings);

  const candidates = [tidy(await draft())];
  const best = () => candidates.reduce((a, b) => (score(b) < score(a) ? b : a));

  for (const attempt of ['rewrite', 'fresh'] as const) {
    if (score(best()) === 0) break;
    try {
      const raw = attempt === 'rewrite' ? await callAi(rewriteRequest(settings, best(), replyProblems(best(), level)), settings) : await draft();
      const text = tidy(raw);
      if (text) candidates.push(text);
    } catch (err) {
      console.warn(`[reply] ${attempt} failed: ${(err as Error).message}`);
    }
  }
  return best();
}

/** `earlier` is the conversation before the message, for context. */
export async function generateBreakdown(callAi: CallAi, settings: Settings, message: Message, earlier: Message[] = []): Promise<Breakdown> {
  const b = toBreakdown(await callAi({ ...breakdownRequest(message, settings, earlier), schema: BREAKDOWN_SCHEMA }, settings));
  for (const line of b.lines) {
    line.japanese = dropKanaFurigana(line.japanese);
    for (const w of line.words) w.text = dropKanaFurigana(w.text);
  }
  return b;
}

export async function generateFeedback(
  callAi: CallAi,
  settings: Settings,
  politeness: Politeness,
  message: Message,
  /** The conversation before the message, for context. */
  earlier: Message[],
): Promise<Feedback> {
  const f = toFeedback(await callAi({ ...feedbackRequest(settings, politeness, message, earlier), schema: FEEDBACK_SCHEMA }, settings));
  f.corrected = autoFix(f.corrected, settings.wkLevel);
  for (const line of f.lines) line.corrected = autoFix(line.corrected, settings.wkLevel);
  return f;
}
