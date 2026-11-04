// Renders Japanese with {漢字|かんじ} furigana markup as <ruby> (or just the
// base text when furigana is off), and marks every kanji above the learner's
// WaniKani level -- in text the AI wrote. The learner's own messages may use
// any kanji they like, so those are not marked. Inside a message the level is
// the one it was written under (its stamp), so lowering the level later doesn't
// make earlier messages look like they broke the rule.

import { createContext, Fragment, useContext, type ReactNode } from 'react';
import { isAllowed, isKanji, kanjiInfo } from '../../shared/kanji.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';

const MARKUP = /\{([^|{}]+)\|([^{}]*)\}/g;

/** The WaniKani level the surrounding message was written under; unset means the current setting. */
const WrittenAtLevel = createContext<number | undefined>(undefined);
export const WrittenAtLevelProvider = WrittenAtLevel.Provider;

/** `level` null: show the kanji's details but never mark it as above the level. `overTitle` heads a marked kanji's title. */
function Kanji({ ch, level, overTitle }: { ch: string; level: number | null; overTitle: string }) {
  const t = useT();
  const info = kanjiInfo(ch);
  const title = info
    ? `${ch} — ${info.meaning} · ${t.wkLevel} ${info.level}${info.on ? `\n${info.on}` : ''}${info.kun ? `\n${info.kun}` : ''}`
    : `${ch} — ${t.notInWk}`;
  const over = level !== null && !isAllowed(ch, level);
  return (
    <span className={over ? 'kanji over-level' : 'kanji'} title={over ? `${overTitle}\n${title}` : title}>
      {ch}
    </span>
  );
}

function marked(text: string, level: number | null, overTitle: string): ReactNode[] {
  return [...text].map((ch, i) => (isKanji(ch) ? <Kanji key={i} ch={ch} level={level} overTitle={overTitle} /> : ch));
}

/**
 * `className` defaults to the Japanese font; pass "" for English that quotes Japanese.
 * `highlight` marks kanji above the learner's level; turn it off for text the learner wrote.
 */
export function JpText({ text, className = 'jp', highlight = true }: { text: string; className?: string; highlight?: boolean }) {
  const { settings } = useSettings();
  const written = useContext(WrittenAtLevel);
  const t = useT();
  const level = highlight ? (written ?? settings.wkLevel) : null;
  // Names the level used: the message's own once it was stamped, which can be below the learner's level now.
  const overTitle = written !== undefined ? t.overWrittenLevel(written) : t.overLevel(settings.wkLevel);
  const mark = (s: string) => marked(s, level, overTitle);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKUP)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(<Fragment key={`t${last}`}>{mark(text.slice(last, at))}</Fragment>);
    const [, base, reading] = match;
    parts.push(
      settings.furigana ? (
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
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={`t${last}`}>{mark(text.slice(last))}</Fragment>);
  return <span className={className || undefined}>{parts}</span>;
}
