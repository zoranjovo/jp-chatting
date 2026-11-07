// What the AI produces for the app -- the partner's next message, a breakdown,
// feedback -- with the checks and coercion around each call. The API routes
// and scripts/eval-prompts.ts both go through here.

import { kanjiTypedIn } from '../shared/kanji.ts';
import { autoFix, dropKanaFurigana, problemCount, replyProblems, salvageFromForeign, tidyMarkup } from '../shared/quality.ts';
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
 * problems wins, earliest first on a tie. Kanji the learner has typed in the
 * chat are allowed whatever their level.
 */
export async function generateReply(callAi: CallAi, settings: Settings, chat: Pick<Chat, 'topic' | 'politeness' | 'messages'>): Promise<string> {
  const level = settings.wkLevel;
  const known = kanjiTypedIn(chat.messages);
  const score = (text: string) => problemCount(replyProblems(text, level, known));
  const tidy = (raw: unknown) => {
    const text = autoFix(String(raw), level, known);
    return score(text) > 0 ? (salvageFromForeign(text, level, known) ?? text) : text;
  };
  const draft = () => callAi({ system: conversationSystem(settings, chat, known), turns: conversationTurns(chat.messages) }, settings);

  const candidates = [tidy(await draft())];
  const best = () => candidates.reduce((a, b) => (score(b) < score(a) ? b : a));

  for (const attempt of ['rewrite', 'fresh'] as const) {
    if (score(best()) === 0) break;
    try {
      const raw = attempt === 'rewrite' ? await callAi(rewriteRequest(settings, best(), replyProblems(best(), level, known), known), settings) : await draft();
      const text = tidy(raw);
      if (text) candidates.push(text);
    } catch (err) {
      console.warn(`[reply] ${attempt} failed: ${(err as Error).message}`);
    }
  }
  return best();
}

/** `earlier` is the conversation before the message, for context; `known`, the kanji the learner has typed in the chat. */
export async function generateBreakdown(
  callAi: CallAi,
  settings: Settings,
  message: Message,
  earlier: Message[] = [],
  known = '',
): Promise<Breakdown> {
  const b = toBreakdown(await callAi({ ...breakdownRequest(message, settings, earlier, known), schema: BREAKDOWN_SCHEMA }, settings));
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
  /** The kanji the learner has typed in the chat. */
  known = '',
): Promise<Feedback> {
  const f = toFeedback(await callAi({ ...feedbackRequest(settings, politeness, message, earlier, known), schema: FEEDBACK_SCHEMA }, settings));
  // Corrections may use any kanji the words need (with furigana), so none are spelled out here.
  f.corrected = tidyMarkup(f.corrected);
  for (const line of f.lines) line.corrected = tidyMarkup(line.corrected);
  return f;
}
