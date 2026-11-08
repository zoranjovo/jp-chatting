import { useEffect, useRef, useState } from 'react';
import type { ReplyStep } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useT } from '../i18n.tsx';

/** A reply this quick needs nothing but the dots. */
const QUIET_MS = 10_000;
const POLL_MS = 2000;

/** "1:05" */
export function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The partner's typing dots. A slow reply also shows how long it has taken and what it is doing (a rewrite
 * or a fresh draft after the first broke the rules), asked of the server every couple of seconds; after a
 * reload the time counts from when the server started, not from when this page began waiting.
 */
export function TypingIndicator({ chatId }: { chatId: string }) {
  const t = useT();
  const [since, setSince] = useState(() => Date.now());
  const [step, setStep] = useState<ReplyStep>('draft');
  const [now, setNow] = useState(() => Date.now());
  const slow = now - since >= QUIET_MS;
  /** The start time is taken from the server once; after that the time counts on here. */
  const synced = useRef(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Asked once on mount, for the start time after a reload; then only while slow enough to show.
  useEffect(() => {
    let stopped = false;
    const poll = () =>
      api.replyStatus(chatId).then(
        (s) => {
          if (stopped || !s.replying) return;
          if (!synced.current) setSince(Date.now() - s.elapsedMs);
          synced.current = true;
          setStep(s.step);
        },
        () => {},
      );
    poll();
    if (!slow) return () => {
      stopped = true;
    };
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [chatId, slow]);

  return (
    <div className="message theirs" aria-hidden>
      <div className="bubble typing">
        <span />
        <span />
        <span />
        {slow && (
          <em className="typing-progress">
            {t.replyStep[step]} · {elapsed(now - since)}
          </em>
        )}
      </div>
    </div>
  );
}
