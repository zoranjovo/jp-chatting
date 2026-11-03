import { useEffect, useRef, useState } from 'react';
import { modelLabel } from '../../shared/context.ts';
import { genkiBook } from '../../shared/genki.ts';
import type { MessageContext } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';

/** The settings a message was written with, one labelled row each. */
export function ContextDetails({ context, createdAt }: { context: MessageContext; createdAt: string }) {
  const t = useT();
  const { settings } = useSettings();
  const locale = settings.uiLanguage === 'ja' ? 'ja-JP' : 'en-GB';
  const rows: [string, string][] = [
    [t.model, modelLabel(context.model)],
    [t.provider, context.provider === 'claude' ? t.providerClaude : t.providerEndpoint],
    context.provider === 'claude' ? [t.effort, context.effort ?? t.effortDefault] : [t.thinking, t.thinkingOption(context.effort ?? '')],
    [t.politeness, context.politeness === 'casual' ? t.casual : t.polite],
    [t.wkLevelLabel, context.wkLevel === 0 ? t.wkMeta(0) : String(context.wkLevel)],
    [t.genkiLabel, context.genkiLesson > 0 ? t.genkiLesson(genkiBook(context.genkiLesson), context.genkiLesson) : t.genkiNone],
    [t.jlptLabel, context.jlptLevel > 0 ? t.jlptOption(context.jlptLevel) : t.jlptNone],
    [t.messageWritten, new Date(createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })],
  ];
  return (
    <dl className="message-info-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A small ⓘ on the partner's messages that pops up how the message was written. */
export function MessageInfo({ context, createdAt }: { context: MessageContext; createdAt: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Closes on a click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="message-info" ref={box}>
      <button
        type="button"
        className={`info-button ${open ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t.messageInfo}
        title={t.messageInfo}
      >
        i
      </button>
      {open && (
        <div className="message-info-pop" role="group" aria-label={t.messageInfo}>
          <strong>{t.messageInfo}</strong>
          <ContextDetails context={context} createdAt={createdAt} />
          <p>{t.messageInfoNote}</p>
        </div>
      )}
    </div>
  );
}
