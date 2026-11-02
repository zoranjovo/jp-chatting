// JLPT levels as a rough guide to how the partner should pitch its Japanese.
// Unlike the kanji level this is not a limit, just context (like the Genki lesson).
// The descriptions follow the JLPT's own "can do" summaries, condensed, minus
// the listening parts (speed of speech) -- the chat is text.

/** 0 means not set; otherwise the N-number (5 = N5, the easiest). */
export type JlptLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const JLPT_LEVELS: Exclude<JlptLevel, 0>[] = [5, 4, 3, 2, 1];

export const JLPT_DESCRIPTION: Record<Exclude<JlptLevel, 0>, string> = {
  5: 'understands basic Japanese: set phrases and short, simple sentences about everyday things',
  4: 'understands basic everyday conversation and simple texts on familiar topics',
  3: 'understands everyday Japanese reasonably well, including fairly natural conversation and texts on everyday topics',
  2: 'understands natural everyday Japanese and much of general-interest material such as news',
  1: 'understands Japanese across a wide range of situations, including complex and abstract topics',
};

export function asJlptLevel(v: unknown): JlptLevel {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 5 ? (n as JlptLevel) : 0;
}
