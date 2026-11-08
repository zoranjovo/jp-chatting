// Prompts and answer schemas for the three things the AI does: keep the
// conversation going, break down its own messages, and give feedback on the
// learner's.

import { allowedKanji, kanjiAboveLevel, kanjiInfo, stripFurigana } from '../shared/kanji.ts';
import type { ReplyProblems } from '../shared/quality.ts';
import { genkiBook, genkiGrammarThrough, MAX_GENKI_LESSON } from '../shared/genki.ts';
import { JLPT_DESCRIPTION, type JlptLevel } from '../shared/jlpt.ts';
import type { Breakdown, Chat, Feedback, Message, Politeness, Settings } from '../shared/types.ts';
import type { ChatTurn } from './ai/index.ts';

/** Stands in for the learner's first turn, so every history starts with a user message. */
const OPENER_CUE = '(The learner has just opened a new chat. Start the conversation.)';

const FURIGANA_RULE = `Furigana: give the reading of every word that contains kanji in this exact markup: {kanji|reading}. The reading is always hiragana -- never romaji, never katakana. Wrap only the kanji part; okurigana stays outside the braces. Examples: {日本語|にほんご}を{話|はな}します。 {今日|きょう}は{暑|あつ}いですね。 Words written only in kana (コーヒー, カフェ, ありがとう) never get markup.`;

/** One line per level. Some tokenizers (Nemotron's in llama.cpp) fail on a run of a few hundred kanji; a level has at most 42. */
function kanjiByLevel(level: number): string {
  const lines = new Map<number, string>();
  for (const k of allowedKanji(level)) {
    const l = kanjiInfo(k)?.level ?? 0;
    lines.set(l, (lines.get(l) ?? '') + k);
  }
  return [...lines].map(([l, kanji]) => `L${l}: ${kanji}`).join('\n');
}

/**
 * `known`: kanji the learner has typed in the chat, which they know whatever their level.
 * `scope`, for an answer that is mostly English: which Japanese the rule covers and what it leaves alone,
 * stated in the rule itself so it never reads as covering everything.
 */
function kanjiRule(level: number, known = '', scope?: { appliesTo: string; exempt?: string }): string {
  const where = scope ? ` in ${scope.appliesTo}` : ' at all';
  const exempt = scope?.exempt ? ` ${scope.exempt}` : '';
  // Only the ones the level doesn't already cover, so the list stays short.
  const typed = kanjiAboveLevel(known, level).join('');
  if (level <= 0) {
    if (!typed) {
      return `Kanji: the learner knows hiragana and katakana but no kanji yet. Do not use any kanji${where} -- write ${scope ? 'it' : 'everything'} in hiragana, and katakana for loanwords.${exempt}`;
    }
    return `Kanji: the learner knows hiragana and katakana, and no kanji yet apart from these, which they have typed themselves in this chat: ${typed}
Use no other kanji${where}. Any word that needs another kanji must be written in hiragana instead (katakana for loanwords).${exempt}`;
  }
  return `Kanji: the learner knows all hiragana and katakana, but only these kanji (WaniKani levels 1-${level}, one line per level):
${kanjiByLevel(level)}${typed ? `\nThey have also typed these kanji themselves in this chat, so they know them too: ${typed}` : ''}
Use no other kanji${where}. Any word that needs a kanji outside ${typed ? 'those' : 'that list'} must be written in hiragana instead (katakana for loanwords). Check every kanji you write against the list; if you are unsure about one, write that word in hiragana.${exempt}`;
}

function styleRule(politeness: Politeness): string {
  return politeness === 'casual'
    ? 'Speech style: casual plain form (だ/る form, like talking with a friend). No です/ます.'
    : 'Speech style: polite です/ます form.';
}

/** For citing lessons: the whole syllabus, so the model names the right one instead of guessing. */
function genkiSyllabus(): string {
  return `Genki's grammar by lesson -- cite only these lessons:
${genkiGrammarThrough(MAX_GENKI_LESSON)}`;
}

/** Where the learner roughly is, as guidance on pitch -- never a limit; the kanji rule wins, and Genki is the closer guide to grammar. */
function jlptRule(level: JlptLevel, genki: boolean): string {
  if (level === 0) return '';
  return `Level guide: the learner is at about JLPT N${level} -- at that level a learner ${JLPT_DESCRIPTION[level]}. Pitch your vocabulary and grammar so someone at that level can follow comfortably. This is a guide, not a hard limit: the kanji rule here comes first${genki ? ', and the Genki grammar guide is the more specific guide to grammar' : ''}.`;
}

/** Plain forms are taught in Genki lesson 8. */
const PLAIN_FORM_LESSON = 8;

/** The grammar of the Genki lessons studied so far, as a guide -- not a limit; empty when the learner isn't using Genki. */
function genkiRule(lesson: number, politeness: Politeness): string {
  if (lesson <= 0) return '';
  const early = politeness === 'casual' && lesson < PLAIN_FORM_LESSON
    ? ` Plain (casual) forms come in lesson ${PLAIN_FORM_LESSON}, which they haven't reached, but they chose casual speech for this chat: keep casual sentences very short and simple.`
    : '';
  return `Grammar guide: the learner studies with the Genki textbooks and has covered lessons 1-${lesson} (Genki ${genkiBook(lesson)}). This is the grammar they know:
${genkiGrammarThrough(lesson)}
Build your messages mainly from this grammar, with vocabulary a Genki student at this point would know. This is a guide, not a hard limit: grammar from a later lesson is fine now and then when it is the natural way to say something, but keep it simple and don't lean on it -- if known grammar says it just as naturally, use that.${early}`;
}

/** `known`: the kanji the learner has typed in this chat (kanjiTypedIn). */
export function conversationSystem(settings: Settings, chat: Pick<Chat, 'topic' | 'politeness'>, known = ''): string {
  const topic = chat.topic;
  const genki = genkiRule(settings.genkiLesson, chat.politeness);
  const jlpt = jlptRule(settings.jlptLevel, genki !== '');
  return `You are a friendly Japanese conversation partner for an English speaker who is learning Japanese. You are chatting by text message.

Rules:
- Write only in Japanese. Never write English or romaji, even when the learner writes in English -- then just answer in simple Japanese as if they had said it in Japanese.
- Keep each message short: one to three short sentences with ${jlpt ? "grammar and vocabulary at the learner's level (see the level guide)" : 'beginner-level grammar and vocabulary'}. Usually end with something easy to answer, such as a simple question.
- ${styleRule(chat.politeness)}
- Do not correct the learner's mistakes or explain grammar; a separate tool does that. Keep the conversation going naturally, guessing what they meant if needed.
- ${topic.trim() ? `Topic or scenario for this chat, chosen by the learner: ${topic.trim()}. Stay in it (play a role if it calls for one).` : 'No topic was chosen: start with an everyday topic and follow wherever the learner takes it.'}
- ${kanjiRule(settings.wkLevel, known)}${genki ? `\n- ${genki}` : ''}${jlpt ? `\n- ${jlpt}` : ''}
- ${FURIGANA_RULE}
- Your output is shown to the learner exactly as written, as your chat message. Write only the message itself: no name label, quotes, translation, romaji, English or notes. Never comment on your own writing -- if you notice a mistake, just write the corrected message.`;
}

export function conversationTurns(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
  if (turns[0]?.role !== 'user') turns.unshift({ role: 'user', content: OPENER_CUE });
  return turns;
}

/** Settings' "Test model": the smallest request that proves the model answers. */
export function testRequest(): { system: string; turns: ChatTurn[] } {
  return {
    system: 'You are being sent a connection test. Reply with one short, friendly sentence confirming you received it.',
    turns: [{ role: 'user', content: 'Hi! This is a test message. Please send a short test response.' }],
  };
}

export function rewriteRequest(settings: Settings, text: string, problems: ReplyProblems, known = ''): { system: string; turns: ChatTurn[] } {
  const fixes = [
    problems.kanji.length > 0 && `- It uses kanji the learner does not know: ${problems.kanji.join(' ')} -- write those words in hiragana instead.`,
    problems.furigana.length > 0 && `- It has broken furigana markup: ${problems.furigana.join(' ')} -- readings must be hiragana, and kana-only words get no markup.`,
    problems.foreign.length > 0 && `- It contains English, romaji or a note that is not part of the message: ${problems.foreign.map((f) => `"${f}"`).join(', ')} -- remove it; keep only the Japanese message (if the note came with a corrected version, keep the corrected version).`,
  ].filter(Boolean);
  return {
    system: `You edit Japanese text for a beginner. ${kanjiRule(settings.wkLevel, known)}\n${FURIGANA_RULE}\nOutput only the edited text -- no comments.`,
    turns: [
      {
        role: 'user',
        content: `This chat message for the learner has problems:\n${fixes.join('\n')}\nFix exactly these and change nothing else. Keep the furigana markup on any remaining kanji.\n\n${text}`,
      },
    ],
  };
}

const str = { type: 'string' } as const;

function object(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

export const BREAKDOWN_SCHEMA = object({
  lines: {
    type: 'array',
    items: object({
      japanese: str,
      translation: str,
      explanation: str,
      words: { type: 'array', items: object({ text: str, reading: str, meaning: str }) },
    }),
  },
});

export const FEEDBACK_SCHEMA = object({
  meaning: str,
  verdict: { type: 'string', enum: ['correct', 'minor', 'incorrect', 'english'] },
  corrected: str,
  summary: str,
  lines: {
    type: 'array',
    items: object({ original: str, originalTranslation: str, corrected: str, translation: str, explanation: str, ok: { type: 'boolean' } }),
  },
});

/** For the English parts of a breakdown or feedback, which the UI renders with inline markdown. */
const ENGLISH_RULE = 'In the English text, write Japanese words and phrases as they are, with no 「」 brackets or quotation marks around them. For emphasis you may use **bold** or *italic*.';

/** How many messages before the one analysed are sent along, so it is read in context and the speakers are kept apart. */
const CONTEXT_MESSAGES = 6;

/** The last few messages, labelled by speaker; a message's further lines are indented, so they can't read as more turns. */
function transcriptOf(earlier: Message[]): string {
  return earlier
    .slice(-CONTEXT_MESSAGES)
    .map((m) => `${m.role === 'user' ? 'Learner' : 'Partner'}: ${stripFurigana(m.content).replace(/\n/g, '\n  ')}`)
    .join('\n');
}

export function breakdownRequest(
  message: Message,
  levels: Pick<Settings, 'genkiLesson' | 'jlptLevel' | 'wkLevel'>,
  earlier: Message[] = [],
  known = '',
): { system: string; turns: ChatTurn[] } {
  const { genkiLesson, jlptLevel, wkLevel } = levels;
  const transcript = transcriptOf(earlier);
  return {
    system: `You are a patient Japanese teacher. ${jlptLevel !== 0 ? `An English-speaking learner at about JLPT N${jlptLevel} (at that level a learner ${JLPT_DESCRIPTION[jlptLevel]})` : 'An English-speaking beginner'} wants to understand a Japanese message from their chat partner, line by line.

Split the message into lines -- usually one sentence each, but join short sentences or split long ones wherever that makes the translation and explanation clearer. Cover the whole message, in order, without skipping anything. For each line give:
- japanese: the Japanese text of the line, copied exactly as in the message -- never turn kana into kanji or change any wording.
- translation: a natural English translation.
- explanation: a brief explanation in English of how the line is built -- the grammar, particles, conjugations and set phrases that matter, in one to three sentences. ${jlptLevel > 0 ? `Pitch it at about JLPT N${jlptLevel}: spend it on what a learner at that level may not know yet${jlptLevel <= 3 ? ', and skip the basics (は as the topic, を, です, ます) unless they do something unusual here' : ''}.` : 'Keep it beginner-friendly.'}${genkiLesson > 0 ? ' The learner studies with Genki: when a grammar point is taught in a Genki lesson, name it, e.g. "te-form (Genki L6)" -- take the lesson from the Genki grammar list below.' : ''}
- words: each word or particle in the line, in order: text (as written in the message), reading (in hiragana -- never romaji; a katakana word keeps its katakana), meaning (a short English gloss or the particle's role).
${transcript ? `
The conversation before the message is given for context. Use it to explain what the message refers to -- names, things mentioned earlier, the question it answers -- but break down only the message itself.
` : ''}
${FURIGANA_RULE.replace('Furigana: give', 'In japanese and words.text, give')}
${kanjiRule(wkLevel, known, {
  appliesTo: 'any Japanese you add in the English parts (another form of a word, an example)',
  exempt: `japanese and words.text copy the message exactly, whatever it uses, and the English may name a word from the message${transcript ? ' or the conversation' : ''} as it is written there.`,
})}
${genkiLesson > 0 ? `
${genkiSyllabus()}
` : ''}
${ENGLISH_RULE}

Answer with JSON only, matching the schema.`,
    turns: [{ role: 'user', content: `${transcript ? `The conversation so far:\n${transcript}\n\n` : ''}The message:\n\n${stripFurigana(message.content)}` }],
  };
}

export function feedbackRequest(
  settings: Settings,
  politeness: Politeness,
  message: Message,
  earlier: Message[] = [],
  known = '',
): { system: string; turns: ChatTurn[] } {
  const transcript = transcriptOf(earlier);
  return {
    system: `You are a kind but honest Japanese teacher. An English-speaking beginner is practising Japanese by chatting, and wants feedback on a message they wrote. They may have written in Japanese, in English, or a mix.

Write to the learner directly: call them "you", and the other side of the chat "your partner".${transcript ? ' Keep straight who said what -- in the conversation, "Learner" lines are theirs and "Partner" lines are their partner\'s.' : ''}

Give:
- meaning: what they are trying to say, in English, in their own voice -- first person, as they would say it (e.g. "I'm from Boston. Where are you from?").
- verdict: "correct" if it is natural, correct Japanese -- even if you would have phrased it differently; "minor" for small slips (a particle, a kana typo, slightly unnatural wording); "incorrect" if the meaning is wrong or unclear; "english" if they wrote mostly in English.
- corrected: the whole message as natural Japanese that a beginner could have written, with every mistake fixed. If it was already correct, repeat it. If they wrote English, translate it.
- summary: one or two encouraging sentences in English, spoken to them ("you"), about how they did and the most important thing to learn.
- lines: the message split into lines (usually one sentence each). For each: original (what they wrote), originalTranslation (what the original literally says in English, mistakes and all, so they can see what they actually said; for English input, repeat it), corrected (the natural Japanese), translation (English of the corrected version), explanation (in English, spoken to them, briefly: what was wrong and why, or why it is right; for English input, how the Japanese is built), ok (true when the original needed no change).

The chat is in ${politeness === 'casual' ? 'casual plain form' : 'polite です/ます form'}; use that style in your corrections, and mention it only if their style is inconsistent.
${settings.jlptLevel > 0 ? `The learner is at about JLPT N${settings.jlptLevel}: pitch the corrected Japanese and your explanations at that level (a guide, not a limit).\n` : ''}${settings.genkiLesson > 0 ? `The learner studies with Genki and has covered lessons 1-${settings.genkiLesson}. Corrected Japanese should use grammar from those lessons where it can; if the natural fix needs later grammar, keep it and say in the explanation which Genki lesson teaches it.
${genkiSyllabus()}
` : ''}Kanji in corrected Japanese: write it as natural Japanese, with whatever kanji its words need -- the furigana gives the reading. But keep the learner's own spelling: a word they wrote in kana stays in kana, and a word they wrote in kanji stays in kanji, unless that word is itself the mistake. When the English quotes their message or your correction, write it as it is there.
${kanjiRule(settings.wkLevel, known, { appliesTo: 'any other Japanese you add in the English parts (another form of a word, an example, an alternative)' })}
Never comment on kanji versus kana, on the learner's kanji level, or on why a word is spelled the way it is -- none of that is a mistake. A kanji they used correctly is fine whatever its level, so don't point it out; mention a kanji only when it is the wrong one for the word.
${FURIGANA_RULE.replace('Furigana: give', 'In corrected Japanese, give')}

${ENGLISH_RULE}

Answer with JSON only, matching the schema.`,
    turns: [
      {
        role: 'user',
        content: `${transcript ? `The conversation so far:\n${transcript}\n\n` : ''}The learner's message:\n${stripFurigana(message.content)}`,
      },
    ],
  };
}

// Models sometimes return a string where a list belongs, or drop a field;
// these coerce whatever came back into the shape the UI renders.

const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const list = (v: unknown): Record<string, unknown>[] => {
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
};

export function toBreakdown(raw: unknown): Breakdown {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    lines: list(r.lines).map((l) => ({
      japanese: text(l.japanese),
      translation: text(l.translation),
      explanation: text(l.explanation),
      words: list(l.words).map((w) => ({ text: text(w.text), reading: text(w.reading), meaning: text(w.meaning) })),
    })),
  };
}

export function toFeedback(raw: unknown): Feedback {
  const r = (raw ?? {}) as Record<string, unknown>;
  const verdict = ['correct', 'minor', 'incorrect', 'english'].includes(text(r.verdict)) ? (r.verdict as Feedback['verdict']) : 'minor';
  return {
    meaning: text(r.meaning),
    verdict,
    corrected: text(r.corrected),
    summary: text(r.summary),
    lines: list(r.lines).map((l) => ({
      original: text(l.original),
      originalTranslation: text(l.originalTranslation),
      corrected: text(l.corrected),
      translation: text(l.translation),
      explanation: text(l.explanation),
      ok: l.ok === true,
    })),
  };
}
