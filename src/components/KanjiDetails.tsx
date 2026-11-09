// A kanji's details -- meaning, WaniKani level, readings, and why it is marked -- on a tap. With a mouse
// they are the kanji's hover title, but a touch screen never shows a title, so a phone had no way to find
// out what a highlighted kanji was. One popup for the whole page, opened by a tap on any `.kanji`, rather
// than floating-ui hooks on every kanji in every message.

import { FloatingPortal, autoUpdate, flip, hide, offset, shift, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { useEffect, useState } from 'react';
import { kanjiInfo } from '../../shared/kanji.ts';
import { useT } from '../i18n.tsx';
import { TOUCH, useMediaQuery } from '../layout.ts';
import { anchoredStyle, listBoundary } from './floating.ts';

export function KanjiDetails() {
  const t = useT();
  const touch = useMediaQuery(TOUCH);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const { refs, floatingStyles, context, middlewareData, isPositioned } = useFloating({
    open: target !== null,
    onOpenChange: (open) => {
      if (!open) setTarget(null);
    },
    elements: { reference: target },
    placement: 'top',
    middleware: [offset(6), flip((state) => ({ fallbackPlacements: ['bottom'], ...listBoundary(state) })), shift((state) => ({ padding: 8, ...listBoundary(state) })), hide()],
    whileElementsMounted: autoUpdate,
  });
  const { getFloatingProps } = useInteractions([useDismiss(context), useRole(context, { role: 'dialog' })]);

  useEffect(() => {
    if (!touch) {
      setTarget(null);
      return;
    }
    const onClick = (e: MouseEvent) => {
      const kanji = e.target instanceof Element ? e.target.closest('.kanji') : null;
      // A kanji inside a button or link is part of that control; the tap is for it.
      if (!(kanji instanceof HTMLElement) || kanji.closest('button, a, [inert]')) return;
      setTarget((open) => (open === kanji ? null : kanji));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [touch]);

  // The kanji's message can be rewound or its chat closed while the popup is open.
  useEffect(() => {
    if (!target) return;
    const gone = new MutationObserver(() => {
      if (!target.isConnected) setTarget(null);
    });
    gone.observe(document.body, { childList: true, subtree: true });
    return () => gone.disconnect();
  }, [target]);

  if (!target) return null;
  const ch = target.textContent ?? '';
  const info = kanjiInfo(ch);
  const over = target.dataset.over;
  return (
    <FloatingPortal>
      <div
        className="kanji-pop"
        ref={refs.setFloating}
        style={anchoredStyle(floatingStyles, middlewareData, isPositioned)}
        aria-label={ch}
        {...getFloatingProps()}
      >
        <span className="kanji-pop-char jp" aria-hidden="true">
          {ch}
        </span>
        <div className="kanji-pop-text">
          {over && <p className="kanji-pop-over">{over}</p>}
          {info ? (
            <>
              <p>
                <strong>{info.meaning}</strong> · {t.wkLevel} {info.level}
              </p>
              {info.on && <p className="jp">{info.on}</p>}
              {info.kun && <p className="jp">{info.kun}</p>}
            </>
          ) : (
            <p>{t.notInWk}</p>
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
