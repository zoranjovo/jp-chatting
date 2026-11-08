// WaniKani kanji levels, and finding kanji above the learner's level. A kanji
// the learner has typed in a chat counts as known in that chat whatever its
// level ("known": a string of those kanji).
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
/** One past the last level: no kanji limit at all, kanji that aren't on WaniKani included. */
export const NO_KANJI_LIMIT = MAX_WK_LEVEL + 1;

/** Any number as a level: whole, 0..NO_KANJI_LIMIT. The one rule for the UI and for saved settings. */
export function clampWkLevel(n: number): number {
  return Math.max(0, Math.min(NO_KANJI_LIMIT, Math.round(n)));
}

/** A typed level, clamped, or null while the text isn't a number yet (empty, "-"). Too big a number ("1e400") is the top level. */
export function parseWkLevel(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : clampWkLevel(n);
}

const KANJI_CHAR = /[㐀-䶿一-鿿豈-﫿]/u;
/** 々 repeats the kanji before it, so it is allowed whenever that kanji is. */
const REPEAT = '々';

export function isKanji(ch: string): boolean {
  return KANJI_CHAR.test(ch);
}

export function kanjiInfo(ch: string): KanjiInfo | undefined {
  return KANJI.get(ch);
}

export function isAllowed(ch: string, level: number, known = ''): boolean {
  if (level >= NO_KANJI_LIMIT || known.includes(ch)) return true;
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

/** Distinct kanji in the text that are above the level and not known, in order of appearance. */
export function kanjiAboveLevel(text: string, level: number, known = ''): string[] {
  const out = new Set<string>();
  for (const ch of stripFurigana(text)) {
    if (ch !== REPEAT && isKanji(ch) && !isAllowed(ch, level, known)) out.add(ch);
  }
  return [...out];
}

/** Every distinct kanji the learner has typed in these messages: if they typed it, they know it. */
export function kanjiTypedIn(messages: readonly { role: string; content: string }[]): string {
  const out = new Set<string>();
  for (const m of messages) {
    if (m.role !== 'user') continue;
    for (const ch of stripFurigana(m.content)) if (ch !== REPEAT && isKanji(ch)) out.add(ch);
  }
  return [...out].join('');
}

/**
 * The kanji a chat counts as known: typed in its messages, or in the rewound message pinned above the composer
 * (gone from the messages, but the learner wrote it). The UI and the analyses both count them this way.
 */
export function kanjiKnownIn(chat: { messages: readonly { role: string; content: string }[]; pinned?: { content: string } }): string {
  return kanjiTypedIn(chat.pinned ? [...chat.messages, { role: 'user', content: chat.pinned.content }] : chat.messages);
}
