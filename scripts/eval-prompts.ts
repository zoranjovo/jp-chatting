// Runs fixed scenarios through the app's real generation code (server/generate.ts)
// on real models, scores the output, and saves everything for comparison.
// Use it before and after changing a prompt.
//
//   pnpm eval --label before claude:haiku claude:opus endpoint:qwen3.6-35b-a3b
//   pnpm eval --compare before after
//
// Results go to .cache/eval/<label>.json; a comparison writes .cache/eval/<a>-vs-<b>.md
// with every output side by side for reading.

import fs from 'node:fs';
import path from 'node:path';
import { callAi } from '../server/ai/index.ts';
import { generateBreakdown, generateFeedback, generateReply, type CallAi } from '../server/generate.ts';
import type { JlptLevel } from '../shared/jlpt.ts';
import { stripFurigana } from '../shared/kanji.ts';
import { problemCount, replyProblems, type ReplyProblems } from '../shared/quality.ts';
import { DEFAULT_SETTINGS, type Breakdown, type Feedback, type Message, type Politeness, type Settings } from '../shared/types.ts';

const OUT_DIR = path.join(import.meta.dirname, '..', '.cache', 'eval');
const msg = (role: Message['role'], content: string, id = content): Message => ({ id, role, content, createdAt: '' });

// --- scenarios ---

interface ReplyCase {
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
interface BreakdownCase {
  kind: 'breakdown';
  name: string;
  level: number;
  genki?: number;
  message: string;
}
interface FeedbackCase {
  kind: 'feedback';
  name: string;
  level: number;
  genki?: number;
  previous: string;
  message: string;
  verdicts: Feedback['verdict'][];
  /** The corrected Japanese should contain one of these. */
  expect: string[];
}
type Case = ReplyCase | BreakdownCase | FeedbackCase;

const CAFE_OPENER = 'いらっしゃいませ！{何|なに}を{飲|の}みますか？';

const CASES: Case[] = [
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
  { kind: 'feedback', name: 'feedback · correct order', level: 10, previous: CAFE_OPENER, message: 'コーヒーをおねがいします。', verdicts: ['correct'], expect: ['コーヒーを'] },
  { kind: 'feedback', name: 'feedback · wrong particle', level: 10, previous: CAFE_OPENER, message: 'コーヒーがおねがいします。', verdicts: ['minor', 'incorrect'], expect: ['コーヒーを'] },
  { kind: 'feedback', name: 'feedback · English input', level: 10, previous: CAFE_OPENER, message: 'Can I have a coffee please?', verdicts: ['english'], expect: ['コーヒー'] },
  {
    kind: 'feedback',
    name: 'feedback · wrong tense',
    level: 20,
    previous: '{週末|しゅうまつ}は{何|なに}をしましたか？',
    message: 'ともだちと えいがを みます。',
    verdicts: ['minor', 'incorrect'],
    expect: ['みました', '{見|み}ました', '見ました'],
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
  // JLPT: the same opener pitched at both ends, with kanji not the limiting factor.
  { kind: 'reply', name: 'jlpt · opener · café · N5', level: 60, jlpt: 5, politeness: 'polite', topic: 'Ordering at a café', messages: [] },
  { kind: 'reply', name: 'jlpt · opener · café · N2', level: 60, jlpt: 2, politeness: 'polite', topic: 'Ordering at a café', messages: [] },
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

function sumProblems(list: ReplyProblems[]): ReplyProblems {
  return { kanji: list.flatMap((p) => p.kanji), furigana: list.flatMap((p) => p.furigana), foreign: list.flatMap((p) => p.foreign) };
}

interface Result {
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

function scoreReply(c: ReplyCase, text: string): Pick<Result, 'problems' | 'checks'> {
  const problems = replyProblems(text, c.level);
  const plain = stripFurigana(text);
  return {
    problems,
    checks: {
      clean: problemCount(problems) === 0,
      style: c.politeness === 'polite' ? POLITE.test(plain) : !POLITE.test(plain),
      short: [...plain.matchAll(/[。！？!?]/g)].length <= 4 && plain.length <= 120,
      notEmpty: plain.trim().length > 0,
      startsJapanese: /^[぀-ヿ一-鿿{「（]/u.test(text.trim()),
      ...(c.genki && c.genki < 6 ? { earlyGenkiGrammar: !BEYOND_EARLY_GENKI.test(plain) } : {}),
    },
  };
}

function scoreBreakdown(c: BreakdownCase, b: Breakdown): Pick<Result, 'problems' | 'checks'> {
  const joined = normalise(b.lines.map((l) => l.japanese).join(''));
  const message = normalise(c.message);
  const texts = b.lines.flatMap((l) => [l.japanese, ...l.words.map((w) => w.text)]);
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
    },
  };
}

function scoreFeedback(c: FeedbackCase, f: Feedback): Pick<Result, 'problems' | 'checks'> {
  const corrected = stripFurigana(f.corrected);
  return {
    problems: replyProblems(f.corrected, c.level),
    checks: {
      verdict: c.verdicts.includes(f.verdict),
      corrected: c.expect.some((e) => corrected.includes(stripFurigana(e)) || f.corrected.includes(e)),
      explained: f.summary.trim().length > 0 && f.meaning.trim().length > 0,
      lines: f.lines.length > 0 && f.lines.every((l) => l.translation.trim() && l.explanation.trim()),
      originalTranslated: f.lines.every((l) => l.ok || (l.originalTranslation ?? '').trim().length > 0),
      noBrackets: ![f.meaning, f.summary, ...f.lines.flatMap((l) => [l.translation, l.explanation])].some((t) => /[「」]/.test(t)),
    },
  };
}

// --- running ---

function settingsFor(model: string, level: number, genki = 0, jlpt: JlptLevel = 0): Settings {
  const [provider, name] = model.split(/:(.*)/s);
  if (provider === 'claude') return { ...DEFAULT_SETTINGS, wkLevel: level, genkiLesson: genki, jlptLevel: jlpt, provider: 'claude', claude: { ...DEFAULT_SETTINGS.claude, model: name, timeoutMs: 240_000 } };
  return { ...DEFAULT_SETTINGS, wkLevel: level, genkiLesson: genki, jlptLevel: jlpt, provider: 'endpoint', endpoint: { baseUrl: 'http://localhost:1234/v1', apiKey: '', model: name } };
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
      const b = await generateBreakdown(recording, settingsFor(model, c.level, c.genki), msg('assistant', c.message));
      return { ...base, ms: Date.now() - started, output: b, ...scoreBreakdown(c, b) };
    }
    const f = await generateFeedback(recording, settingsFor(model, c.level, c.genki), 'polite', msg('user', c.message), msg('assistant', c.previous));
    return { ...base, ms: Date.now() - started, output: f, ...scoreFeedback(c, f) };
  } catch (err) {
    return { ...base, ms: Date.now() - started, error: (err as Error).message, output: null, problems: { kanji: [], furigana: [], foreign: [] }, checks: { ran: false } };
  }
}

async function runModel(model: string, samples: number): Promise<Result[]> {
  const results: Result[] = [];
  for (const c of CASES) {
    for (let s = 0; s < (c.kind === 'reply' ? samples : 1); s += 1) {
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

type Run = Record<string, Result[]>;

function summarise(results: Result[]) {
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

function printSummary(run: Run) {
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
function rescore(run: Run): Run {
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

function compare(a: string, b: string) {
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
  const entries = await Promise.all(models.map(async (m) => [m, await runModel(m, samples)] as const));
  const run: Run = Object.fromEntries(entries);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${label}.json`), JSON.stringify(run, null, 2));
  printSummary(run);
  console.log(`saved ${path.join(OUT_DIR, `${label}.json`)}`);
}
