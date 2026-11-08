// Checks on Japanese the model wrote for the learner: kanji above their level,
// broken furigana markup, and English or romaji that leaked into the text.

import { isKanji, kanjiAboveLevel } from './kanji.ts';

const MARKUP = /\{([^|{}]+)\|([^{}]*)\}/g;
/** A furigana reading: hiragana, plus the long-vowel and iteration marks. */
const READING = /^[ぁ-ゖゝゞー]+$/u;

const hasKanji = (s: string) => [...s].some((ch) => isKanji(ch) || ch === '々');

/**
 * Markup that is wrong: readings that aren't hiragana ({待|machi}, {日|ニチ}),
 * markup on text with no kanji in it ({カフェ|cafe}), and stray braces or
 * pipes left over from malformed markup ({教|おし}}, {アイスコーヒー}).
 */
export function badFurigana(text: string): string[] {
  const out: string[] = [];
  for (const [whole, base, reading] of text.matchAll(MARKUP)) {
    if (!hasKanji(base) || !READING.test(reading)) out.push(whole);
  }
  const rest = text.replace(MARKUP, '\u0000');
  for (const m of rest.matchAll(/[^\s\u0000]{0,6}[{}|｜][^\s\u0000]{0,6}/g)) out.push(m[0]);
  return [...new Set(out)];
}

/** Drops markup from text that has no kanji ({カフェ|cafe} -> カフェ) -- always safe, so done without asking the model. */
export function dropKanaFurigana(text: string): string {
  return text.replace(MARKUP, (whole, base: string) => (hasKanji(base) ? whole : base));
}

/** Every kana in the base also appears, in order, in the reading -- so the reading really spells the whole base. */
function readingCoversBase(base: string, reading: string): boolean {
  const kana = [...base].filter((ch) => /[ぁ-ゖ]/u.test(ch));
  let i = 0;
  for (const ch of reading) if (ch === kana[i]) i += 1;
  return i === kana.length;
}

/**
 * Writes words with kanji above the level in kana, using the reading the
 * markup already gives ({注文|ちゅうもん} -> ちゅうもん, {飲み物|のみもの} ->
 * のみもの). Only when the reading is hiragana and spells the whole base; a
 * bare kanji, or markup like {お願|ねが}, is left for a rewrite.
 */
export function kanaForKanjiAboveLevel(text: string, level: number, known = ''): string {
  return text.replace(MARKUP, (whole, base: string, reading: string) =>
    kanjiAboveLevel(base, level, known).length > 0 && READING.test(reading) && readingCoversBase(base, reading) ? reading : whole,
  );
}

/** Empty braces and braces with no reading in them ({}, {アイスコーヒー}) are just dropped. */
function dropEmptyMarkup(text: string): string {
  return text.replace(/\{\}/g, '').replace(/\{([^|{}]*)\}/g, '$1');
}

/** A reasoning block some models leave in, closed or not. */
function dropThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
}

/** Stray reasoning, empty braces and furigana on kana removed -- the fixes for any Japanese the model writes. */
export function tidyMarkup(text: string): string {
  return dropKanaFurigana(dropEmptyMarkup(dropThinking(text))).trim();
}

/** The fixes that need no model: tidyMarkup, and kanji the learner doesn't know spelled out from their readings. */
export function autoFix(text: string, level: number, known = ''): string {
  return kanaForKanjiAboveLevel(tidyMarkup(text), level, known);
}

/** Share of distinct characters two texts have in common (Jaccard), furigana ignored. */
function similarity(a: string, b: string): number {
  const sa = new Set(a.replace(MARKUP, '$1'));
  const sb = new Set(b.replace(MARKUP, '$1'));
  const shared = [...sa].filter((ch) => sb.has(ch)).length;
  return shared / (sa.size + sb.size - shared || 1);
}

/**
 * When the model talks to itself in English inside a reply, the real message
 * is the Japanese before the first English run or after the last one. Only
 * the unambiguous shapes are handled here; anything else goes to the model:
 *   clean message + note              -> the message
 *   broken draft + note + clean fix   -> the fix
 *   clean draft + note + clean redo   -> the redo, if it is the same message again
 * Returns null when it can't tell.
 */
export function salvageFromForeign(text: string, level: number, known = ''): string | null {
  const masked = text.replace(MARKUP, (m) => '　'.repeat(m.length));
  const runs = [...masked.matchAll(/[A-Za-z][A-Za-z'’-]*(?:[\s,.!?:;—–-]+[A-Za-z][A-Za-z'’-]*){2,}[.!?]?|\b[a-z]{3,}\b/g)];
  if (runs.length === 0) return null;
  // Whatever is left of the note's punctuation ("(in list)." -> ").") goes too.
  const trim = (s: string) => s.replace(/^[^぀-ヿ一-鿿{「『（]+/u, '').replace(/[^぀-ヿ一-鿿}。！？」』）…ー〜]+$/u, '');
  const before = trim(text.slice(0, runs[0].index!));
  const last = runs.at(-1)!;
  const after = trim(text.slice(last.index! + last[0].length));
  const japanese = (s: string) => /[぀-ヿ一-鿿]{2,}/u.test(s);
  const clean = (s: string) => japanese(s) && problemCount(replyProblems(s, level, known)) === 0;

  if (clean(before) && !japanese(after)) return before;
  if (clean(after) && japanese(before) && !clean(before)) return after;
  if (clean(after) && clean(before) && similarity(before, after) >= 0.5) return after;
  return null;
}

/**
 * English or romaji in what should be Japanese: three or more Latin words in a
 * row (a sentence or a note), or any lowercase Latin word of three letters or
 * more (romaji like "desu", or "cafe"). Acronyms and brand-style words such as
 * OK, LINE, Wi-Fi or iPhone are allowed. Furigana readings are not looked at.
 */
export function foreignText(text: string): string[] {
  const plain = text.replace(MARKUP, '$1');
  const found = [
    ...(plain.match(/[A-Za-z][A-Za-z'’-]*(?:[\s,.!?:;—–-]+[A-Za-z][A-Za-z'’-]*){2,}[.!?]?/g) ?? []),
    ...(plain.match(/\b[a-z]{3,}\b/g) ?? []),
  ];
  // A word already inside a longer run is reported once, with its run.
  return [...new Set(found)].filter((s, _, all) => !all.some((o) => o !== s && o.includes(s)));
}

export interface ReplyProblems {
  /** Kanji above the learner's WaniKani level that they haven't typed in the chat. */
  kanji: string[];
  furigana: string[];
  foreign: string[];
}

export function replyProblems(text: string, level: number, known = ''): ReplyProblems {
  return { kanji: kanjiAboveLevel(text, level, known), furigana: badFurigana(text), foreign: foreignText(text) };
}

export function problemCount(p: ReplyProblems): number {
  return p.kanji.length + p.furigana.length + p.foreign.length;
}
