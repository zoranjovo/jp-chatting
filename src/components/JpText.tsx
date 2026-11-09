// Renders Japanese with {漢字|かんじ} furigana markup as <ruby>, and marks every
// kanji above the learner's WaniKani level -- in text the AI wrote. The learner's
// own messages may use any kanji they like, so those are not marked, and a kanji
// they have typed anywhere in the chat counts as known everywhere in it. Inside a
// message the level is the one it was written under (its stamp), so lowering the
// level later doesn't make earlier messages look like they broke the rule.
// With furigana off, a word keeps its reading while it has a kanji the learner
// doesn't know (above their level now, never typed), so it can always be read.

import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { isAllowed, isKanji, kanjiAboveLevel, kanjiInfo } from '../../shared/kanji.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';

const MARKUP = /\{([^|{}]+)\|([^{}]*)\}/g;

/**
 * The furigana groups in the text, where `at`..`end` is the markup. Groups with nothing between them become
 * one: models often mark a word a kanji at a time ({今|こん}{週|しゅう}), and a ruby per kanji pushes the
 * kanji apart wherever a reading is wider than its kanji (今 週).
 */
export function rubyGroups(text: string): { at: number; end: number; base: string; reading: string }[] {
  const out: { at: number; end: number; base: string; reading: string }[] = [];
  for (const match of text.matchAll(MARKUP)) {
    const at = match.index ?? 0;
    const [whole, base, reading] = match;
    const prev = out.at(-1);
    if (prev && prev.end === at) Object.assign(prev, { end: at + whole.length, base: prev.base + base, reading: prev.reading + reading });
    else out.push({ at, end: at + whole.length, base, reading });
  }
  return out;
}

/** The WaniKani level the surrounding message was written under; unset means the current setting. */
const WrittenAtLevel = createContext<number | undefined>(undefined);
export const WrittenAtLevelProvider = WrittenAtLevel.Provider;

/** The kanji the learner has typed in the chat on screen (kanjiTypedIn). */
const KnownKanji = createContext('');
export const KnownKanjiProvider = KnownKanji.Provider;

/** `level` null: show the kanji's details but never mark it as above the level. `overTitle` heads a marked kanji's title. */
function Kanji({ ch, level, known, overTitle }: { ch: string; level: number | null; known: string; overTitle: string }) {
  const t = useT();
  const info = kanjiInfo(ch);
  const title = info
    ? `${ch} — ${info.meaning} · ${t.wkLevel} ${info.level}${info.on ? `\n${info.on}` : ''}${info.kun ? `\n${info.kun}` : ''}`
    : `${ch} — ${t.notInWk}`;
  const over = level !== null && !isAllowed(ch, level, known);
  // data-over says why it is marked, for KanjiDetails: a touch screen never shows the title.
  return (
    <span className={over ? 'kanji over-level' : 'kanji'} title={over ? `${overTitle}\n${title}` : title} data-over={over ? overTitle : undefined}>
      {ch}
    </span>
  );
}

function marked(text: string, level: number | null, known: string, overTitle: string): ReactNode[] {
  return [...text].map((ch, i) => (isKanji(ch) ? <Kanji key={i} ch={ch} level={level} known={known} overTitle={overTitle} /> : ch));
}

/**
 * `className` defaults to the Japanese font; pass "" for English that quotes Japanese.
 * `highlight` marks kanji above the learner's level; turn it off for text the learner wrote.
 */
export function JpText({ text, className = 'jp', highlight = true }: { text: string; className?: string; highlight?: boolean }) {
  const { settings } = useSettings();
  const written = useContext(WrittenAtLevel);
  const known = useContext(KnownKanji);
  const t = useT();
  const level = highlight ? (written ?? settings.wkLevel) : null;
  // Names the level used: the message's own once it was stamped, which can be below the learner's level now.
  const overTitle = written !== undefined ? t.overWrittenLevel(written) : t.overLevel(settings.wkLevel);
  const mark = (s: string) => marked(s, level, known, overTitle);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const { at, end, base, reading } of rubyGroups(text)) {
    if (at > last) parts.push(<Fragment key={`t${last}`}>{mark(text.slice(last, at))}</Fragment>);
    parts.push(
      settings.furigana || kanjiAboveLevel(base, settings.wkLevel, known).length > 0 ? (
        <ruby key={`r${at}`}>
          {mark(base)}
          <rp>(</rp>
          <rt>{reading}</rt>
          <rp>)</rp>
        </ruby>
      ) : (
        <Fragment key={`r${at}`}>{mark(base)}</Fragment>
      ),
    );
    last = end;
  }
  if (last < text.length) parts.push(<Fragment key={`t${last}`}>{mark(text.slice(last))}</Fragment>);
  return <span className={className || undefined}>{parts}</span>;
}
