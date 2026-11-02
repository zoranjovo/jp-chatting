import { useState } from 'react';
import type { Message } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useT } from '../i18n.tsx';
import { BreakdownView, FeedbackView } from './Analysis.tsx';
import { JpText } from './JpText.tsx';

export function MessageBubble({ chatId, message, onUpdated }: { chatId: string; message: Message; onUpdated: (m: Message) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = message.role === 'user';
  const analysis = mine ? message.feedback : message.breakdown;

  const analyze = async (refresh: boolean) => {
    setOpen(true);
    if (analysis && !refresh) return;
    setBusy(true);
    setError(null);
    try {
      onUpdated(await api.analyze(chatId, message.id, refresh));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`message ${mine ? 'mine' : 'theirs'}`}>
      <div className="bubble">
        <div className="bubble-text">
          <JpText text={message.content} />
        </div>
        <div className="bubble-actions">
          <button
            type="button"
            className={`chip ${open ? 'active' : ''}`}
            onClick={() => (open ? setOpen(false) : analyze(false))}
            aria-expanded={open}
          >
            {open ? t.hide : mine ? t.check : t.breakdown}
          </button>
        </div>
      </div>
      {open && (
        <div className="analysis">
          {busy && <div className="analysis-busy">{t.analyzing}</div>}
          {error && (
            <div className="error">
              {t.errorPrefix} {error}
            </div>
          )}
          {!busy && message.breakdown && !mine && <BreakdownView breakdown={message.breakdown} />}
          {!busy && message.feedback && mine && <FeedbackView feedback={message.feedback} />}
          {!busy && (analysis || error) && (
            <button type="button" className="link-button" onClick={() => analyze(true)}>
              {t.redo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
