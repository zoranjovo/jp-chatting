// Turns one davidluzgouveia/kanji-data entry into a row of
// shared/wanikani-kanji.json: [kanji, level, meanings, on'yomi, kun'yomi].
// Kept apart from build-kanji.ts so tests can use it without a download.

export interface SourceKanji {
  wk_level?: number | null;
  wk_meanings?: string[] | null;
  meanings?: string[] | null;
  wk_readings_on?: string[] | null;
  wk_readings_kun?: string[] | null;
}

export type KanjiRow = readonly [kanji: string, level: number, meanings: string, on: string, kun: string];

const MARKER = /^[\^!]/;

/**
 * The dataset prefixes WaniKani answers that are accepted but not primary with "^",
 * and ones WaniKani doesn't accept at all with "!". Drops the markers and lists the
 * primary answers first, then the other accepted ones, then the rest.
 */
export function wkAnswers(list: string[] | null | undefined): string[] {
  const rank = (s: string) => (s.startsWith('!') ? 2 : s.startsWith('^') ? 1 : 0);
  return (list ?? [])
    .map((s) => s.trim())
    .sort((a, b) => rank(a) - rank(b))
    .map((s) => s.replace(MARKER, '').trim())
    .filter(Boolean);
}

/** The row for a kanji WaniKani teaches, else undefined. */
export function toRow(kanji: string, k: SourceKanji): KanjiRow | undefined {
  if (typeof k.wk_level !== 'number') return undefined;
  const meanings = wkAnswers(k.wk_meanings?.length ? k.wk_meanings : k.meanings);
  return [kanji, k.wk_level, meanings.slice(0, 2).join(', '), wkAnswers(k.wk_readings_on).join('、'), wkAnswers(k.wk_readings_kun).join('、')];
}

/** Whether a row still carries the dataset's markers, as files built before wkAnswers did. */
export function hasMarkers([, , meanings, on, kun]: KanjiRow): boolean {
  return [...meanings.split(', '), ...on.split('、'), ...kun.split('、')].some((s) => MARKER.test(s.trim()));
}
