// The panels under a message: a line-by-line breakdown of the partner's
// message, or feedback on the learner's.

import type { Breakdown, Feedback } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { JpText } from './JpText.tsx';

export function BreakdownView({ breakdown }: { breakdown: Breakdown }) {
  const t = useT();
  return (
    <ol className="analysis-lines">
      {breakdown.lines.map((line, i) => (
        <li key={i} className="analysis-line">
          <div className="line-jp">
            <JpText text={line.japanese} />
          </div>
          <div className="line-en">{line.translation}</div>
          {line.explanation && <p className="line-explain">{line.explanation}</p>}
          {line.words.length > 0 && (
            <div className="words" aria-label={t.words}>
              {line.words.map((w, j) => (
                <span key={j} className="word">
                  <span className="word-text">
                    <JpText text={w.text} />
                  </span>
                  {w.reading && w.reading !== w.text && <span className="word-reading">{w.reading}</span>}
                  <span className="word-meaning">{w.meaning}</span>
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function FeedbackView({ feedback }: { feedback: Feedback }) {
  const t = useT();
  return (
    <div className="feedback">
      <div className={`verdict verdict-${feedback.verdict}`}>{t.verdict[feedback.verdict]}</div>
      {feedback.summary && <p className="feedback-summary">{feedback.summary}</p>}
      <dl className="feedback-overall">
        <dt>{t.youMeant}</dt>
        <dd>{feedback.meaning}</dd>
        <dt>{t.naturalJapanese}</dt>
        <dd className="line-jp">
          <JpText text={feedback.corrected} />
        </dd>
      </dl>
      <ol className="analysis-lines">
        {feedback.lines.map((line, i) => (
          <li key={i} className={`analysis-line ${line.ok ? 'line-ok' : 'line-fix'}`}>
            {line.ok ? (
              <div className="line-jp">
                <span className="line-tag ok">{t.lineOk}</span>
                <JpText text={line.original} />
              </div>
            ) : (
              <>
                <div className="line-jp line-original">
                  <span className="line-tag">{t.yourLine}</span>
                  <span className="strike">{line.original}</span>
                </div>
                <div className="line-jp">
                  <span className="line-tag fix">{t.betterLine}</span>
                  <JpText text={line.corrected} />
                </div>
              </>
            )}
            <div className="line-en">{line.translation}</div>
            {line.explanation && <p className="line-explain">{line.explanation}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
