// The panels under a message: a line-by-line breakdown of the partner's
// message, or feedback on the learner's. A breakdown line shows its sentence
// once, as written, with each word glossed underneath (interlinear) and the
// translation below; the explanation sits to the right when there is room.

import type { ReactNode } from 'react';
import { isKanji, stripFurigana } from '../../shared/kanji.ts';
import type { Breakdown, Feedback } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { JpText } from './JpText.tsx';
import { RichText } from './RichText.tsx';

type Line = Breakdown['lines'][number];

interface Segment {
  text: string;
  meaning?: string;
}

/**
 * The sentence cut into the model's words, in order. Text the words don't
 * cover (punctuation, a skipped word) stays in as an unglossed segment, so the
 * whole sentence always reads through. A word without furigana gets its
 * reading as markup when it has kanji.
 */
export function glossSegments(line: Line): Segment[] {
  const sentence = stripFurigana(line.japanese);
  const out: Segment[] = [];
  // Punctuation joins the word before it, so the sentence stays together.
  const gap = (text: string) => {
    const prev = out.at(-1);
    if (prev && PUNCTUATION.test(text)) prev.text += text;
    else out.push({ text });
  };
  let pos = 0;
  for (const w of line.words) {
    const plain = stripFurigana(w.text);
    const at = plain ? sentence.indexOf(plain, pos) : -1;
    if (at < 0) continue;
    if (at > pos) gap(sentence.slice(pos, at));
    if (PUNCTUATION.test(plain) && out.length > 0) {
      gap(plain);
    } else {
      const needsReading = w.text === plain && [...plain].some(isKanji) && /^[ぁ-ゖー]+$/u.test(w.reading) && w.reading !== plain;
      out.push({ text: needsReading ? `{${plain}|${w.reading}}` : w.text, meaning: w.meaning });
    }
    pos = at + plain.length;
  }
  if (pos === 0) return [{ text: line.japanese }];
  if (pos < sentence.length) gap(sentence.slice(pos));
  return out;
}

const PUNCTUATION = /^[\s。、！？!?…・「」『』（）()〜~,.]+$/u;

/** English that quotes Japanese and uses inline markdown -- rendered, in the UI font. */
function Explained({ text, className }: { text: string; className: string }) {
  return (
    <p className={className}>
      <RichText text={text} />
    </p>
  );
}

export function BreakdownView({ breakdown }: { breakdown: Breakdown }) {
  const t = useT();
  return (
    <ol className="analysis-lines breakdown-lines">
      {breakdown.lines.map((line, i) => (
        <li key={i} className="analysis-line">
          <div className="line-main">
            <div className="gloss-line" aria-label={t.words}>
              {glossSegments(line).map((s, j) =>
                s.meaning ? (
                  <span key={j} className="gloss">
                    <span className="gloss-jp">
                      <JpText text={s.text} />
                    </span>
                    <span className="gloss-en">{s.meaning}</span>
                  </span>
                ) : (
                  <span key={j} className="gloss gloss-plain">
                    <span className="gloss-jp">
                      <JpText text={s.text} />
                    </span>
                  </span>
                ),
              )}
            </div>
            <div className="line-en">
              <RichText text={line.translation} />
            </div>
          </div>
          {line.explanation && <Explained className="line-explain" text={line.explanation} />}
        </li>
      ))}
    </ol>
  );
}

/** A labelled pair of lines: the Japanese, and its English underneath (omitted when the model gave none). */
function FixRow({ tag, tagClass, japanese, english }: { tag: string; tagClass: string; japanese: ReactNode; english: string }) {
  return (
    <>
      <span className={`line-tag ${tagClass}`}>{tag}</span>
      <div className={`fix-row fix-row-${tagClass}`}>
        <div className="line-jp">{japanese}</div>
        {english && (
          <div className="line-en">
            <RichText text={english} />
          </div>
        )}
      </div>
    </>
  );
}

export function FeedbackView({ feedback }: { feedback: Feedback }) {
  const t = useT();
  return (
    <div className="feedback">
      <div className={`verdict verdict-${feedback.verdict}`}>{t.verdict[feedback.verdict]}</div>
      {feedback.summary && <Explained className="feedback-summary" text={feedback.summary} />}
      <dl className="feedback-overall">
        <dt>{t.youMeant}</dt>
        <dd>
          <RichText text={feedback.meaning} />
        </dd>
        <dt>{t.naturalJapanese}</dt>
        <dd className="line-jp">
          <JpText text={feedback.corrected} />
        </dd>
      </dl>
      <ol className="analysis-lines feedback-lines">
        {feedback.lines.map((line, i) => (
          <li key={i} className={`analysis-line ${line.ok ? 'line-ok' : 'line-fix'}`}>
            {/* What they wrote and the better version, each with its English under it; the explanation after. */}
            <div className="fix-rows">
              {line.ok ? (
                <FixRow tag={t.lineOk} tagClass="ok" japanese={<JpText text={line.original} highlight={false} />} english={line.translation} />
              ) : (
                <>
                  <FixRow
                    tag={t.yourLine}
                    tagClass="yours"
                    japanese={<JpText text={line.original} highlight={false} />}
                    english={line.originalTranslation}
                  />
                  <FixRow tag={t.betterLine} tagClass="fix" japanese={<JpText text={line.corrected} />} english={line.translation} />
                </>
              )}
            </div>
            {line.explanation && <Explained className="line-explain" text={line.explanation} />}
          </li>
        ))}
      </ol>
    </div>
  );
}
