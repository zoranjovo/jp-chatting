import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '../../shared/types.ts';
import { useAnnounce } from '../announce.ts';
import { api } from '../api.ts';
import { breakdownHintDone } from '../hints.ts';
import { useT } from '../i18n.tsx';
import { BreakdownView, FeedbackView } from './Analysis.tsx';
import { BreakdownIcon, CheckIcon, RewindIcon } from './Icons.tsx';
import { MessageInfo } from './MessageInfo.tsx';
import { JpText, WrittenAtLevelProvider } from './JpText.tsx';
import { Tooltip } from './Tooltip.tsx';

/** Matches the open/close transition in styles.css. */
const SLIDE_MS = 260;

export function MessageBubble({
  chatId,
  message,
  onUpdated,
  onRewind,
  rewindDisabled = false,
  hint = false,
}: {
  chatId: string;
  message: Message;
  onUpdated: (m: Message) => void;
  /** Only on the learner's messages. */
  onRewind?: () => void;
  rewindDisabled?: boolean;
  /** Show the one-time hint pointing at this message's Breakdown button. */
  hint?: boolean;
}) {
  const t = useT();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  // The panel stays mounted once opened, so closing can animate; `shown` is set
  // just after `open` so the opening transition starts from collapsed.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const mine = message.role === 'user';
  const analysis = mine ? message.feedback : message.breakdown;
  const label = mine ? t.check : t.breakdown;
  const rewindHint = useId();

  useLayoutEffect(() => {
    if (!open) return setShown(false);
    // Make the browser compute the collapsed style first, or there is nothing to transition from.
    wrap.current?.getBoundingClientRect();
    setShown(true);
  }, [open]);

  // Once it has opened, or its content has arrived, bring the panel into view if it ended up off screen.
  useEffect(() => {
    if (!shown || busy) return;
    const timer = setTimeout(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [shown, busy]);

  const analyze = async (refresh: boolean) => {
    setMounted(true);
    setOpen(true);
    if (!mine) breakdownHintDone();
    if (analysis && !refresh) return;
    setBusy(true);
    setError(null);
    announce(t.analyzing);
    try {
      onUpdated(await api.analyze(chatId, message.id, refresh));
      announce(mine ? t.feedbackReady : t.breakdownReady);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <WrittenAtLevelProvider value={message.context?.wkLevel}>
      <div className={`message ${mine ? 'mine' : 'theirs'}`}>
        <div className="bubble">
          <div className="bubble-text">
            <JpText text={message.content} highlight={!mine} />
          </div>
          <div className="bubble-actions">
            {!mine && message.context && <MessageInfo context={message.context} createdAt={message.createdAt} />}
            {onRewind && (
              <Tooltip
                label={
                  <>
                    <strong>{t.rewind}</strong>
                    <span className="tooltip-hint">{t.rewindTitle}</span>
                  </>
                }
              >
                <button
                  type="button"
                  className="icon-button"
                  onClick={onRewind}
                  disabled={rewindDisabled}
                  aria-label={t.rewind}
                  aria-describedby={rewindHint}
                >
                  <RewindIcon />
                </button>
                {/* The tooltip only exists while shown, so screen readers get the warning from here. */}
                <span id={rewindHint} hidden>
                  {t.rewindTitle}
                </span>
              </Tooltip>
            )}
            <Tooltip label={<strong>{open ? t.hide : label}</strong>}>
              <button
                type="button"
                className={`icon-button ${open ? 'active' : ''}`}
                onClick={() => (open ? setOpen(false) : analyze(false))}
                aria-expanded={open}
                aria-label={open ? t.hide : label}
              >
                {mine ? <CheckIcon /> : <BreakdownIcon />}
              </button>
            </Tooltip>
          </div>
        </div>
        {hint && (
          <div className="hint-callout" role="note">
            <span>
              {t.breakdownHint(
                <span className="inline-action">
                  <BreakdownIcon />
                  {t.breakdown}
                </span>,
              )}
            </span>
            <button type="button" className="link-button" onClick={breakdownHintDone}>
              {t.gotIt}
            </button>
          </div>
        )}
        {mounted && (
          <div ref={wrap} className={`analysis-wrap ${shown ? 'open' : ''}`} inert={!open}>
            <div className="analysis-clip">
              <div className="analysis" ref={panel}>
                {busy && <div className="analysis-busy">{t.analyzing}</div>}
                {error && (
                  <div className="error" role="alert">
                    {t.errorPrefix} {error}
                  </div>
                )}
                {!busy && message.breakdown && !mine && <BreakdownView breakdown={message.breakdown} />}
                {!busy && message.feedback && mine && <FeedbackView feedback={message.feedback} />}
                {/* Kept while busy (aria-disabled, not disabled), so the keyboard focus on it isn't dropped to the page. */}
                {(analysis || error) && (
                  <button type="button" className="link-button" aria-disabled={busy} onClick={() => !busy && analyze(true)}>
                    {t.redo}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </WrittenAtLevelProvider>
  );
}
