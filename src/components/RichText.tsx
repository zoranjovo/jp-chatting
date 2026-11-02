// The AI's English (explanations, summaries, translations) with the inline
// markdown models like to use -- **bold**, *italic*, `code` -- rendered, and
// any Japanese inside still going through JpText for furigana and kanji marks.
// Japanese quoted in 「」 loses the brackets (they look odd in English) and is
// shown as a lightly highlighted term instead. Kanji here are never flagged as
// above the level: this is commentary, often quoting the learner's own words.
// Only inline marks: block markdown (lists, headings) isn't asked for and
// would look out of place in these short notes.

import type { ReactNode } from 'react';
import { JpText } from './JpText.tsx';

export type Inline = { kind: 'text' | 'strong' | 'em' | 'code' | 'term'; text: string };

// A mark needs text hugging it on both sides, so "5 * 3" or a lone "*" stays as typed.
const INLINE = /\*\*(\S(?:[^*]*\S)?)\*\*|\*(\S(?:[^*]*\S)?)\*|`([^`]+)`|「([^「」]+)」/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: 'strong', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'em', text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: 'code', text: m[3] });
    else out.push({ kind: 'term', text: m[4] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function RichText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i): ReactNode => {
        const inner = <JpText text={part.text} className="" highlight={false} />;
        if (part.kind === 'strong') return <strong key={i}>{inner}</strong>;
        if (part.kind === 'em') return <em key={i}>{inner}</em>;
        if (part.kind === 'code') return <code key={i}>{inner}</code>;
        if (part.kind === 'term') return <span key={i} className="jp-term">{inner}</span>;
        return <JpText key={i} text={part.text} className="" highlight={false} />;
      })}
    </>
  );
}
