import {
  FloatingPortal,
  autoUpdate,
  flip,
  hide,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { useState } from 'react';
import { modelLabel } from '../../shared/context.ts';
import { genkiBook } from '../../shared/genki.ts';
import type { MessageContext } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';
import { InfoIcon } from './Icons.tsx';
import { anchoredStyle, listBoundary } from './floating.ts';

/** The settings a message was written with, one labelled row each. */
export function ContextDetails({ context, createdAt }: { context: MessageContext; createdAt: string }) {
  const t = useT();
  const { settings } = useSettings();
  const locale = settings.uiLanguage === 'ja' ? 'ja-JP' : 'en-GB';
  const rows: [string, string][] = [
    [t.model, modelLabel(context.model)],
    [t.provider, context.provider === 'claude' ? t.providerClaude : t.providerEndpoint],
    context.provider === 'claude' ? [t.effort, t.effortOption(context.effort ?? '')] : [t.thinking, t.thinkingOption(context.effort ?? '')],
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

/**
 * A small ⓘ on the partner's messages that pops up how the message was written: on hover (and stays
 * while the pointer moves into it), or on a click or tap, which keeps it open until a click elsewhere or Escape.
 */
export function MessageInfo({ context, createdAt }: { context: MessageContext; createdAt: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context: floating, middlewareData, isPositioned } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [offset(6), flip(listBoundary), shift((state) => ({ padding: 8, ...listBoundary(state) })), hide()],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(floating, { mouseOnly: true, delay: { open: 120 }, handleClose: safePolygon() }),
    useClick(floating),
    useDismiss(floating),
    useRole(floating, { role: 'dialog' }),
  ]);

  return (
    <div className="message-info">
      <button
        type="button"
        ref={refs.setReference}
        className={`icon-button ${open ? 'active' : ''}`}
        aria-label={t.messageInfo}
        {...getReferenceProps()}
      >
        <InfoIcon />
      </button>
      {open && (
        <FloatingPortal>
          <div
            className="message-info-pop"
            ref={refs.setFloating}
            style={anchoredStyle(floatingStyles, middlewareData, isPositioned)}
            aria-label={t.messageInfo}
            {...getFloatingProps()}
          >
            <strong>{t.messageInfo}</strong>
            <ContextDetails context={context} createdAt={createdAt} />
            <p>{t.messageInfoNote}</p>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
