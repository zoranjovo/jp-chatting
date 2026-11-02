// WaniKani kanji levels, and finding kanji above the learner's level.
//
// wanikani-kanji.json is built from davidluzgouveia/kanji-data (MIT), whose
// wk_level fields follow WaniKani's level layout at the time it was compiled.
// Each row: [kanji, level, meanings, on'yomi, kun'yomi].

import rows from './wanikani-kanji.json';

export interface KanjiInfo {
  kanji: string;
  level: number;
  meaning: string;
  on: string;
  kun: string;
}

const KANJI = new Map<string, KanjiInfo>(
  (rows as [string, number, string, string, string][]).map(([kanji, level, meaning, on, kun]) => [kanji, { kanji, level, meaning, on, kun }]),
);

export const MAX_WK_LEVEL = 60;

const KANJI_CHAR = /[㐀-䶿一-鿿豈-﫿]/u;
/** 々 repeats the kanji before it, so it is allowed whenever that kanji is. */
const REPEAT = '々';

export function isKanji(ch: string): boolean {
  return KANJI_CHAR.test(ch);
}

export function kanjiInfo(ch: string): KanjiInfo | undefined {
  return KANJI.get(ch);
}

export function isAllowed(ch: string, level: number): boolean {
  const info = KANJI.get(ch);
  return !!info && info.level <= level;
}

export function allowedKanji(level: number): string[] {
  return [...KANJI.values()].filter((k) => k.level <= level).map((k) => k.kanji);
}

/** Removes furigana markup, keeping the base text: {漢字|かんじ} -> 漢字. */
export function stripFurigana(text: string): string {
  return text.replace(/\{([^|{}]+)\|[^{}]*\}/g, '$1');
}

/** Distinct kanji in the text that are above the level, in order of appearance. */
export function kanjiAboveLevel(text: string, level: number): string[] {
  const out = new Set<string>();
  for (const ch of stripFurigana(text)) {
    if (ch !== REPEAT && isKanji(ch) && !isAllowed(ch, level)) out.add(ch);
  }
  return [...out];
}
