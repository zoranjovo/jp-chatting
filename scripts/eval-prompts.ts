// Runs fixed scenarios through the app's real generation code (server/generate.ts)
// on real models, scores the output, and saves everything for comparison.
// Use it before and after changing a prompt.
//
//   pnpm eval --label before claude:haiku claude:opus endpoint:qwen3.6-35b-a3b
//   pnpm eval --compare before after
//
// Results go to .cache/eval/<label>.json; a comparison writes .cache/eval/<a>-vs-<b>.md
// with every output side by side for reading. A model can take an effort or Thinking level:
// claude:claude-opus-5-5#high, or endpoint:qwen3.6-35b-a3b#none for thinking off.
//
// The scenarios, scoring and runner are exported for other scripts (such as a local
// model benchmark); the command line below only runs when this file is run directly.

import fs from 'node:fs';
import path from 'node:path';
import { callAi } from '../server/ai/index.ts';
import { generateBreakdown, generateFeedback, generateReply, type CallAi } from '../server/generate.ts';
import type { JlptLevel } from '../shared/jlpt.ts';
import { kanjiAboveLevel, kanjiTypedIn, NO_KANJI_LIMIT, stripFurigana } from '../shared/kanji.ts';
import { problemCount, replyProblems, type ReplyProblems } from '../shared/quality.ts';
import { CLAUDE_EFFORTS, DEFAULT_SETTINGS, ENDPOINT_REASONING, type Breakdown, type Feedback, type Message, type Politeness, type Settings } from '../shared/types.ts';

export const OUT_DIR = path.join(import.meta.dirname, '..', '.cache', 'eval');
export const msg = (role: Message['role'], content: string, id = content): Message => ({ id, role, content, createdAt: '' });

// --- scenarios ---

export interface ReplyCase {
  kind: 'reply';
  name: string;
  level: number;
  /** Genki lesson studied up to; 0 or absent means not using Genki. */
  genki?: number;
  /** JLPT level as a guide; 0 or absent means not set. */
  jlpt?: JlptLevel;
  politeness: Politeness;
  topic: string;
  messages: Message[];
}
export interface BreakdownCase {
  kind: 'breakdown';
  name: string;
  level: number;
  genki?: number;
  jlpt?: JlptLevel;
  /** The conversation before the message. */
  earlier?: Message[];
  message: string;
}
export interface FeedbackCase {
  kind: 'feedback';
  name: string;
  level: number;
  genki?: number;
  /** The conversation before the message, ending with the partner's message it answers. */
  earlier: Message[];
  message: string;
  verdicts: Feedback['verdict'][];
  /** The corrected Japanese should contain one of these. */
  expect: string[];
  /** The corrected Japanese should contain all of these, spelled as the learner spelled them. */
  keeps?: string[];
}
export type Case = ReplyCase | BreakdownCase | FeedbackCase;

const CAFE_OPENER = 'いらっしゃいませ！{何|なに}を{飲|の}みますか？';

export const CASES: Case[] = [
  { kind: 'reply', name: 'opener · café · L10 · polite', level: 10, politeness: 'polite', topic: 'Ordering at a café', messages: [] },
  { kind: 'reply', name: 'opener · no topic · L0 (kana only)', level: 0, politeness: 'polite', topic: '', messages: [] },
  { kind: 'reply', name: 'opener · weekend plans · L3 · casual', level: 3, politeness: 'casual', topic: 'Weekend plans', messages: [] },
  { kind: 'reply', name: 'opener · self-introduction · L30', level: 30, politeness: 'polite', topic: 'Self-introduction', messages: [] },
  {
    kind: 'reply',
    name: 'turn · café · learner orders',
    level: 10,
    politeness: 'polite',
    topic: 'Ordering at a café',
    messages: [msg('assistant', CAFE_OPENER), msg('user', 'コーヒーをください。')],
  },
  {
    kind: 'reply',
    name: 'turn · café · learner writes English',
    level: 10,
    politeness: 'polite',
    topic: 'Ordering at a café',
    messages: [msg('assistant', CAFE_OPENER), msg('user', "I'd like a sandwich and an iced tea please")],
  },
  {
    kind: 'reply',
    name: 'turn · weekend · learner makes a tense mistake',
    level: 20,
    politeness: 'polite',
    topic: '',
    messages: [msg('assistant', '{週末|しゅうまつ}は{何|なに}をしましたか？'), msg('user', 'きのう、ともだちと えいがを みます。')],
  },
  // Kanji the learner typed are known: the partner may use them, whatever the level.
  {
    kind: 'reply',
    name: 'turn · learner types kanji above the level',
    level: 10,
    politeness: 'polite',
    topic: '',
    messages: [msg('assistant', '{週末|しゅうまつ}は{何|なに}をしましたか？'), msg('user', '大阪で串カツを食べました。')],
  },
  {
    kind: 'breakdown',
    name: 'breakdown · polite café message',
    level: 10,
    message: 'いらっしゃいませ！{今日|きょう}は{何|なに}を{飲|の}みますか。コーヒーとお{茶|ちゃ}があります。',
  },
  {
    kind: 'breakdown',
    name: 'breakdown · casual past tense',
    level: 20,
    message: '{週末|しゅうまつ}は{何|なに}してた？{私|わたし}は{友達|ともだち}と{映画|えいが}を{見|み}に{行|い}ったよ。',
  },
  { kind: 'feedback', name: 'feedback · correct order', level: 10, earlier: [msg('assistant', CAFE_OPENER)], message: 'コーヒーをおねがいします。', verdicts: ['correct'], expect: ['コーヒーを'] },
  { kind: 'feedback', name: 'feedback · wrong particle', level: 10, earlier: [msg('assistant', CAFE_OPENER)], message: 'コーヒーがおねがいします。', verdicts: ['minor', 'incorrect'], expect: ['コーヒーを'] },
  { kind: 'feedback', name: 'feedback · English input', level: 10, earlier: [msg('assistant', CAFE_OPENER)], message: 'Can I have a coffee please?', verdicts: ['english'], expect: ['コーヒー'] },
  {
    kind: 'feedback',
    name: 'feedback · wrong tense',
    level: 20,
    earlier: [msg('assistant', '{週末|しゅうまつ}は{何|なに}をしましたか？')],
    message: 'ともだちと えいがを みます。',
    verdicts: ['minor', 'incorrect'],
    expect: ['みました', '{見|み}ました', '見ました'],
  },
  // Who said what: the partner introduces itself and asks; the learner answers. The feedback must not swap them.
  {
    kind: 'feedback',
    name: "feedback · answers the partner's question",
    level: 10,
    earlier: [msg('assistant', 'はじめまして！ユキです。{大学生|だいがくせい}です。'), msg('user', 'はじめまして。サムです。'), msg('assistant', 'サムさんは アメリカの どこから {来|き}ましたか？')],
    message: 'ボストンから きました。ユキさんは どこから きましたか？',
    verdicts: ['correct', 'minor'],
    expect: ['ボストン'],
  },
  {
    kind: 'feedback',
    name: 'feedback · English question to the partner',
    level: 10,
    earlier: [msg('assistant', 'どんな {音楽|おんがく}が {好|す}きですか？'), msg('assistant', 'ジャズですか？ロックですか？')],
    message: "I don't understand. What does ongaku mean?",
    verdicts: ['english'],
    expect: ['{音楽|おんがく}', '音楽', 'おんがく'],
  },
  // Spelling in corrections: an advanced learner's correct kanji stay, unremarked; a beginner's kana stay kana, so the fix stands out.
  {
    kind: 'feedback',
    name: 'feedback · correct kanji above the level',
    level: 10,
    earlier: [msg('assistant', '{最近|さいきん}、どんな{勉強|べんきょう}をしていますか？')],
    message: '語彙力を上げるために、毎朝新聞を読んでいます。',
    verdicts: ['correct', 'minor'],
    expect: ['語彙力'],
    keeps: ['語彙力', '新聞'],
  },
  {
    kind: 'feedback',
    name: 'feedback · beginner in kana, wrong particle',
    level: 3,
    earlier: [msg('assistant', 'がくせいですか？')],
    message: 'はい、わたしはだいがくせいをです。',
    verdicts: ['minor', 'incorrect'],
    expect: ['だいがくせいです'],
    keeps: ['わたし', 'だいがくせい'],
  },
  // Genki: the same kinds of scenario with the grammar guided to early lessons.
  { kind: 'reply', name: 'genki · opener · café · lesson 3', level: 10, genki: 3, politeness: 'polite', topic: 'Ordering at a café', messages: [] },
  {
    kind: 'reply',
    name: 'genki · turn · weekend · lesson 4',
    level: 10,
    genki: 4,
    politeness: 'polite',
    topic: '',
    messages: [msg('assistant', '{週末|しゅうまつ}は{何|なに}をしましたか？'), msg('user', 'ともだちと えいがを みました。')],
  },
  { kind: 'reply', name: 'genki · opener · casual · lesson 9', level: 15, genki: 9, politeness: 'casual', topic: 'Hobbies', messages: [] },
  {
    kind: 'breakdown',
    name: 'genki · breakdown names lessons',
    level: 20,
    genki: 12,
    message: 'すみません、ちょっと{待|ま}ってください。{今|いま}、{電話|でんわ}をしています。',
  },
  // Breakdowns in context: a name only the conversation explains, and pitch at both ends of JLPT.
  {
    kind: 'breakdown',
    name: 'breakdown · uses the conversation',
    level: 30,
    earlier: [msg('assistant', '{好|す}きなお{笑|わら}い{芸人|げいにん}はいますか？'), msg('user', '{千鳥|ちどり}が{大好|だいす}きです！ノブさんのツッコミがおもしろいです。')],
    message: 'いいですね！{千鳥|ちどり}の{漫才|まんざい}は{私|わたし}も{好|す}きです。ノブさんの「クセがすごい」は{有名|ゆうめい}ですよね。',
  },
  {
    kind: 'breakdown',
    name: 'breakdown · N5 · basics explained',
    level: 10,
    jlpt: 5,
    message: '{私|わたし}は{毎朝|まいあさ}コーヒーを{飲|の}みます。あなたは？',
  },
  {
    kind: 'breakdown',
    name: 'breakdown · N1 · skips the basics',
    level: 60,
    jlpt: 1,
    message: '{早速|さっそく}ですが、{先日|せんじつ}ご{提案|ていあん}いただいた{件|けん}について、{社内|しゃない}で{検討|けんとう}させていただきました。',
  },
  {
    kind: 'breakdown',
    name: 'breakdown · L1 · no new kanji in explanations',
    level: 1,
    earlier: [msg('assistant', 'しゅみは なんですか？'), msg('user', 'えを かくのが すきです。')],
    message: 'いいですね！どんな えを かきますか？{人|ひと}ですか、{山|やま}ですか？',
  },
  // JLPT: the same opener pitched at both ends, with kanji not the limiting factor.
  { kind: 'reply', name: 'jlpt · opener · café · N5', level: 60, jlpt: 5, politeness: 'polite', topic: 'Ordering at a café', messages: [] },
  { kind: 'reply', name: 'jlpt · opener · café · N2', level: 60, jlpt: 2, politeness: 'polite', topic: 'Ordering at a café', messages: [] },
  {
    kind: 'reply',
    name: 'jlpt · turn · serious topic · N1 · no kanji limit',
    level: NO_KANJI_LIMIT,
    jlpt: 1,
    politeness: 'casual',
    topic: 'Japanese comedy',
    messages: [
      msg('assistant', '{最近|さいきん}、{何|なに}かおもろい{漫才|まんざい}{見|み}た？'),
      msg('user', '見たで。せや、「緊張と緩和」について、ちょっと真面目に話そうや。笑いって結局なんで起きると思う？'),
    ],
  },
  {
    kind: 'reply',
    name: 'jlpt · turn · weekend · N4',
    level: 20,
    jlpt: 4,
    politeness: 'polite',
    topic: '',
    messages: [msg('assistant', '{週末|しゅうまつ}は{何|なに}をしましたか？'), msg('user', 'ともだちと えいがを みました。')],
  },
];

/**
 * Grammar a lesson-3/4 Genki student hasn't met: te-forms (L6-7), plain
 * negatives and 〜たい (L8, L11), past plain forms (L9). A rough net -- read
 * the outputs too. Genki is a guide, not a limit, so the odd hit is fine; watch the rate.
 */
const BEYOND_EARLY_GENKI = /て(ください|いる|います|いました|も|から)|ないで|たい[ですか。？]|と思|たことが|でしょう|(?<!ま)[っいしちにびみり]た[よね。？！]/;

// --- scoring ---

const POLITE = /(です|ます|ません|でした|ました|ましょう)/;
const normalise = (s: string) => stripFurigana(s).replace(/[\s。、！？!?・…「」『』（）()〜~,.]/g, '');

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i += 1;
  return i === needle.length;
}

export function sumProblems(list: ReplyProblems[]): ReplyProblems {
  return { kanji: list.flatMap((p) => p.kanji), furigana: list.flatMap((p) => p.furigana), foreign: list.flatMap((p) => p.foreign) };
}

export interface Result {
  case: string;
  kind: Case['kind'];
  sample: number;
  ms: number;
  error?: string;
  /** The final text the learner would see (reply) or the JSON (analysis). */
  output: unknown;
  /** Every model call made for this case, for reading the raw first draft. */
  calls: string[];
  problems: ReplyProblems;
  /** Case-specific pass/fail checks. */
  checks: Record<string, boolean>;
}

/**
 * Feedback that explains spelling by the kanji limit, which it never should. Not a bare "written in hiragana":
 * explanations say that of particles and okurigana all the time.
 */
export const LIMIT_TALK = /kanji (limit|level)|WaniKani|(only|just) (written|spelled) in (hiragana|kana)|in (hiragana|kana) (here )?because/i;

function scoreReply(c: ReplyCase, text: string): Pick<Result, 'problems' | 'checks'> {
  const problems = replyProblems(text, c.level, kanjiTypedIn(c.messages));
  const plain = stripFurigana(text);
  // As the prompt's length rule: up to a short paragraph at N2-N1, four sentences at N3, three short ones below.
  const [maxSentences, maxChars] = c.jlpt === 1 || c.jlpt === 2 ? [7, 300] : c.jlpt === 3 ? [5, 160] : [4, 120];
  return {
    problems,
    checks: {
      clean: problemCount(problems) === 0,
      style: c.politeness === 'polite' ? POLITE.test(plain) : !POLITE.test(plain),
      short: [...plain.matchAll(/[。！？!?]/g)].length <= maxSentences && plain.length <= maxChars,
      notEmpty: plain.trim().length > 0,
      startsJapanese: /^[぀-ヿ一-鿿{「（]/u.test(text.trim()),
      ...(c.genki && c.genki < 6 ? { earlyGenkiGrammar: !BEYOND_EARLY_GENKI.test(plain) } : {}),
    },
  };
}

function scoreBreakdown(c: BreakdownCase, b: Breakdown): Pick<Result, 'problems' | 'checks'> {
  const known = kanjiTypedIn(c.earlier ?? []);
  const joined = normalise(b.lines.map((l) => l.japanese).join(''));
  const message = normalise(c.message);
  const texts = b.lines.flatMap((l) => [l.japanese, ...l.words.map((w) => w.text)]);
  // Kanji above the learner's level in the English, other than in words named from the message or the conversation, as the prompt allows.
  const quoted = new Set(stripFurigana([c.message, ...(c.earlier ?? []).map((m) => m.content)].join('')));
  const added = b.lines.flatMap((l) => [l.translation, l.explanation, ...l.words.map((w) => w.meaning)]).flatMap((t) => kanjiAboveLevel(t, c.level, known));
  return {
    problems: sumProblems(texts.map((t) => ({ ...replyProblems(t, 60), foreign: [] }))),
    checks: {
      lines: b.lines.length > 0,
      covers: isSubsequence(message, joined) && joined.length <= message.length * 1.15,
      translated: b.lines.every((l) => l.translation.trim().length > 0),
      explained: b.lines.every((l) => l.explanation.trim().length > 0),
      words: b.lines.every((l) => l.words.length > 0),
      readingsKana: b.lines.every((l) => l.words.every((w) => !/[A-Za-z]/.test(w.reading))),
      noBrackets: b.lines.every((l) => !/[「」]/.test(l.translation + l.explanation)),
      noNewKanji: added.every((k) => quoted.has(k)),
    },
  };
}

function scoreFeedback(c: FeedbackCase, f: Feedback): Pick<Result, 'problems' | 'checks'> {
  const corrected = stripFurigana(f.corrected);
  const english = [f.meaning, f.summary, ...f.lines.flatMap((l) => [l.translation, l.explanation])];
  return {
    // Corrections may use any kanji their words need, so only markup and stray English count.
    problems: { ...replyProblems(f.corrected, c.level), kanji: [] },
    checks: {
      ...(c.keeps ? { keepsSpelling: c.keeps.every((k) => corrected.includes(k)) } : {}),
      noLimitTalk: !english.some((t) => LIMIT_TALK.test(t)),
      verdict: c.verdicts.includes(f.verdict),
      corrected: c.expect.some((e) => corrected.includes(stripFurigana(e)) || f.corrected.includes(e)),
      explained: f.summary.trim().length > 0 && f.meaning.trim().length > 0,
      lines: f.lines.length > 0 && f.lines.every((l) => l.translation.trim() && l.explanation.trim()),
      originalTranslated: f.lines.every((l) => l.ok || (l.originalTranslation ?? '').trim().length > 0),
      noBrackets: ![f.meaning, f.summary, ...f.lines.flatMap((l) => [l.translation, l.explanation])].some((t) => /[「」]/.test(t)),
      // Shown under "You said" and spoken to the learner, so never about them in the third person, and the meaning in their own voice.
      addressesLearner:
        ![f.meaning, f.summary, ...f.lines.map((l) => l.explanation)].some((t) => /\bthe (learner|student|user)\b/i.test(t)) &&
        !/^\s*(they|he|she)\b/i.test(f.meaning),
    },
  };
}

// --- running ---

/**
 * "claude:<model>" or "endpoint:<model>", each with an optional "#<level>": Claude's effort (e.g. "#high"),
 * or an endpoint's reasoning_effort (e.g. "#none" for thinking off). Without one Claude gets the CLI's own
 * default effort, as runs did before the app's default became "high", so old and new runs compare.
 */
function settingsFor(model: string, level: number, genki = 0, jlpt: JlptLevel = 0): Settings {
  const [provider, spec] = model.split(/:(.*)/s);
  const [name, suffix = ''] = spec.split('#');
  const base = { ...DEFAULT_SETTINGS, wkLevel: level, genkiLesson: genki, jlptLevel: jlpt };
  if (provider === 'claude') {
    const effort = CLAUDE_EFFORTS.find((e) => e === suffix);
    if (effort === undefined) throw new Error(`${model}: Claude's effort is one of ${CLAUDE_EFFORTS.filter(Boolean).join(', ')}`);
    return { ...base, provider: 'claude', claude: { ...DEFAULT_SETTINGS.claude, model: name, effort, timeoutMs: 600_000 } };
  }
  const reasoning = ENDPOINT_REASONING.find((r) => r === suffix);
  if (reasoning === undefined) throw new Error(`${model}: an endpoint's thinking is one of ${ENDPOINT_REASONING.filter(Boolean).join(', ')}`);
  return { ...base, provider: 'endpoint', endpoint: { baseUrl: 'http://localhost:1234/v1', apiKey: '', model: name, reasoning } };
}

async function runCase(model: string, c: Case, sample: number): Promise<Result> {
  const calls: string[] = [];
  const recording: CallAi = async (request, settings) => {
    const out = await callAi(request, settings);
    calls.push(typeof out === 'string' ? out : JSON.stringify(out));
    return out;
  };
  const started = Date.now();
  const base = { case: c.name, kind: c.kind, sample, calls };
  try {
    if (c.kind === 'reply') {
      const text = await generateReply(recording, settingsFor(model, c.level, c.genki, c.jlpt), { topic: c.topic, politeness: c.politeness, messages: c.messages });
      return { ...base, ms: Date.now() - started, output: text, ...scoreReply(c, text) };
    }
    if (c.kind === 'breakdown') {
      const earlier = c.earlier ?? [];
      const b = await generateBreakdown(recording, settingsFor(model, c.level, c.genki, c.jlpt), msg('assistant', c.message), earlier, kanjiTypedIn(earlier));
      return { ...base, ms: Date.now() - started, output: b, ...scoreBreakdown(c, b) };
    }
    const mine = msg('user', c.message);
    const f = await generateFeedback(recording, settingsFor(model, c.level, c.genki), 'polite', mine, c.earlier, kanjiTypedIn([...c.earlier, mine]));
    return { ...base, ms: Date.now() - started, output: f, ...scoreFeedback(c, f) };
  } catch (err) {
    return { ...base, ms: Date.now() - started, error: (err as Error).message, output: null, problems: { kanji: [], furigana: [], foreign: [] }, checks: { ran: false } };
  }
}

export const SKIPPED = 'skipped: over the time budget';

/** Runs every case in order. Past `deadline` (ms since epoch) the remaining cases are recorded as skipped, not run. */
export async function runModel(model: string, samples: number, deadline = Infinity): Promise<Result[]> {
  const results: Result[] = [];
  for (const c of CASES) {
    for (let s = 0; s < (c.kind === 'reply' ? samples : 1); s += 1) {
      if (Date.now() > deadline) {
        results.push({ case: c.name, kind: c.kind, sample: s, ms: 0, error: SKIPPED, output: null, calls: [], problems: { kanji: [], furigana: [], foreign: [] }, checks: { ran: false } });
        continue;
      }
      const r = await runCase(model, c, s);
      results.push(r);
      const failed = Object.entries(r.checks).filter(([, ok]) => !ok).map(([k]) => k);
      const issues = problemCount(r.problems);
      console.log(`[${model}] ${c.name} #${s + 1}: ${(r.ms / 1000).toFixed(1)}s${r.error ? ` ERROR ${r.error.slice(0, 120)}` : ''}${failed.length ? ` failed: ${failed.join(',')}` : ''}${issues ? ` problems: ${issues}` : ''}`);
    }
  }
  return results;
}

// --- reporting ---

export type Run = Record<string, Result[]>;

export function summarise(results: Result[]) {
  const replies = results.filter((r) => r.kind === 'reply');
  const analyses = results.filter((r) => r.kind !== 'reply');
  const checks = (rs: Result[]) => rs.flatMap((r) => Object.values(r.checks));
  const pct = (xs: boolean[]) => (xs.length ? Math.round((100 * xs.filter(Boolean).length) / xs.length) : 0);
  const p = sumProblems(results.map((r) => r.problems));
  const rewrites = replies.filter((r) => r.calls.length > 1).length;
  return {
    replyChecks: pct(checks(replies)),
    cleanReplies: `${replies.filter((r) => r.checks.clean).length}/${replies.length}`,
    analysisChecks: pct(checks(analyses)),
    kanji: p.kanji.length,
    furigana: p.furigana.length,
    foreign: p.foreign.length,
    rewrites,
    errors: results.filter((r) => r.error).length,
    avgReplyChars: Math.round(replies.reduce((n, r) => n + stripFurigana(String(r.output ?? '')).length, 0) / Math.max(1, replies.length)),
    avgReplyS: +(replies.reduce((n, r) => n + r.ms, 0) / Math.max(1, replies.length) / 1000).toFixed(1),
    avgAnalysisS: +(analyses.reduce((n, r) => n + r.ms, 0) / Math.max(1, analyses.length) / 1000).toFixed(1),
  };
}

export function printSummary(run: Run) {
  console.table(Object.fromEntries(Object.entries(run).map(([model, rs]) => [model, summarise(rs)])));
}

function show(r: Result | undefined): string {
  if (!r) return '—';
  if (r.error) return `**error:** ${r.error}`;
  const failed = Object.entries(r.checks).filter(([, ok]) => !ok).map(([k]) => k);
  const issues = [...r.problems.kanji.map((k) => `kanji ${k}`), ...r.problems.furigana, ...r.problems.foreign.map((f) => `"${f}"`)];
  const flags = [...failed.map((f) => `✗ ${f}`), ...issues].join(', ');
  const body =
    r.kind === 'reply'
      ? String(r.output)
      : r.kind === 'breakdown'
        ? (r.output as Breakdown).lines.map((l) => `${l.japanese} — ${l.translation} (${l.explanation})`).join('<br>')
        : (() => {
            const f = r.output as Feedback;
            return `[${f.verdict}] ${f.corrected} — ${f.summary}`;
          })();
  const draft = r.kind === 'reply' && r.calls.length > 1 ? `<br><sub>first draft: ${r.calls[0]}</sub>` : '';
  return `${body.replace(/\n/g, ' ').replace(/\|/g, '¦')}${draft}${flags ? `<br>**${flags}**` : ''}`;
}

/** Scores a saved run again with the current checks, so two runs are always judged alike. */
export function rescore(run: Run): Run {
  for (const results of Object.values(run)) {
    for (const r of results) {
      const c = CASES.find((x) => x.name === r.case);
      if (!c || r.error || r.output == null) continue;
      Object.assign(
        r,
        c.kind === 'reply'
          ? scoreReply(c, String(r.output))
          : c.kind === 'breakdown'
            ? scoreBreakdown(c, r.output as Breakdown)
            : scoreFeedback(c, r.output as Feedback),
      );
    }
  }
  return run;
}

export function compare(a: string, b: string) {
  const runA: Run = rescore(JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${a}.json`), 'utf8')));
  const runB: Run = rescore(JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${b}.json`), 'utf8')));
  const models = [...new Set([...Object.keys(runA), ...Object.keys(runB)])];
  const rows: Record<string, unknown> = {};
  for (const m of models) {
    if (runA[m]) rows[`${m} (${a})`] = summarise(runA[m]);
    if (runB[m]) rows[`${m} (${b})`] = summarise(runB[m]);
  }
  console.table(rows);

  let md = `# ${a} vs ${b}\n`;
  for (const m of models) {
    md += `\n## ${m}\n\n| case | ${a} | ${b} |\n|---|---|---|\n`;
    const keys = [...new Set([...(runA[m] ?? []), ...(runB[m] ?? [])].map((r) => `${r.case}#${r.sample}`))];
    for (const key of keys) {
      const find = (rs: Result[] | undefined) => rs?.find((r) => `${r.case}#${r.sample}` === key);
      md += `| ${key} | ${show(find(runA[m]))} | ${show(find(runB[m]))} |\n`;
    }
  }
  const file = path.join(OUT_DIR, `${a}-vs-${b}.md`);
  fs.writeFileSync(file, md);
  console.log(`side by side: ${file}`);
}

// --- main ---

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };

  if (args[0] === '--compare') {
    compare(args[1], args[2]);
  } else {
    const label = flag('--label') ?? new Date().toISOString().replace(/[:.]/g, '-');
    const samples = Number(flag('--samples') ?? 2);
    const models = args.length > 0 ? args : ['claude:haiku'];
    // A mistyped "#level" fails here, before any model is called, not on every case of the run.
    for (const m of models) settingsFor(m, 0);
    const entries = await Promise.all(models.map(async (m) => [m, await runModel(m, samples)] as const));
    const run: Run = Object.fromEntries(entries);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${label}.json`), JSON.stringify(run, null, 2));
    printSummary(run);
    console.log(`saved ${path.join(OUT_DIR, `${label}.json`)}`);
  }
}
