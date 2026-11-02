// Renders Japanese with {漢字|かんじ} furigana markup as <ruby> (or just the
// base text when furigana is off), and marks every kanji above the learner's
// WaniKani level.

import { Fragment, type ReactNode } from 'react';
import { isAllowed, isKanji, kanjiInfo } from '../../shared/kanji.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';

const MARKUP = /\{([^|{}]+)\|([^{}]*)\}/g;

function Kanji({ ch, level }: { ch: string; level: number }) {
  const t = useT();
  const info = kanjiInfo(ch);
  const title = info
    ? `${ch} — ${info.meaning} · ${t.wkLevel} ${info.level}${info.on ? `\n${info.on}` : ''}${info.kun ? `\n${info.kun}` : ''}`
    : `${ch} — ${t.notInWk}`;
  const over = !isAllowed(ch, level);
  return (
    <span className={over ? 'kanji over-level' : 'kanji'} title={over ? `${t.overLevel}\n${title}` : title}>
      {ch}
    </span>
  );
}

function marked(text: string, level: number): ReactNode[] {
  return [...text].map((ch, i) => (isKanji(ch) ? <Kanji key={i} ch={ch} level={level} /> : ch));
}

export function JpText({ text }: { text: string }) {
  const { settings } = useSettings();
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKUP)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(<Fragment key={`t${last}`}>{marked(text.slice(last, at), settings.wkLevel)}</Fragment>);
    const [, base, reading] = match;
    parts.push(
      settings.furigana ? (
        <ruby key={`r${at}`}>
          {marked(base, settings.wkLevel)}
          <rp>(</rp>
          <rt>{reading}</rt>
          <rp>)</rp>
        </ruby>
      ) : (
        <Fragment key={`r${at}`}>{marked(base, settings.wkLevel)}</Fragment>
      ),
    );
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={`t${last}`}>{marked(text.slice(last), settings.wkLevel)}</Fragment>);
  return <span className="jp">{parts}</span>;
}
