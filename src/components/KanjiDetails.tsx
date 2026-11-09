// A kanji's details -- meaning, WaniKani level, readings, and why it is marked -- on a tap. With a mouse
// they are the kanji's hover title, but a touch screen never shows a title, so a phone had no way to find
// out what a highlighted kanji was. One popup for the whole page, opened by a tap on any `.kanji`, rather
// than floating-ui hooks on every kanji in every message.

import { FloatingPortal, autoUpdate, flip, hide, offset, shift, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { useEffect, useState } from 'react';
import { kanjiInfo } from '../../shared/kanji.ts';
import { useT } from '../i18n.tsx';
import { anchoredStyle, listBoundary } from './floating.ts';

/** The tapped kanji, read when tapped: the span may be re-rendered with another kanji while the popup is open. */
interface Tapped {
  el: HTMLElement;
  ch: string;
  over: string | undefined;
}

const kanjiAt = (target: EventTarget | null) => (target instanceof Element ? target.closest('.kanji') : null);

export function KanjiDetails() {
  const t = useT();
  const [tapped, setTapped] = useState<Tapped | null>(null);
  const { refs, floatingStyles, context, middlewareData, isPositioned } = useFloating({
    open: tapped !== null,
    onOpenChange: (open, event, reason) => {
      // A tap on another kanji is the click handler's to handle: it moves the popup there.
      if (!open && !(reason === 'outside-press' && kanjiAt(event?.target ?? null))) setTapped(null);
    },
    elements: { reference: tapped?.el },
    placement: 'top',
    middleware: [offset(6), flip((state) => ({ fallbackPlacements: ['bottom'], ...listBoundary(state) })), shift((state) => ({ padding: 8, ...listBoundary(state) })), hide()],
    whileElementsMounted: autoUpdate,
  });
  // Closed by a click outside, not a press: on a touch screen every scroll starts with a press, and the popup
  // should survive scrolling to read the sentence under it (it hides while its kanji is out of view).
  const { getFloatingProps } = useInteractions([useDismiss(context, { outsidePressEvent: 'click' }), useRole(context, { role: 'dialog' })]);

  useEffect(() => {
    // By the tap's own pointer, not a media query: a laptop with a touch screen has a mouse as its main pointer,
    // and its touch taps need the popup as much as a phone's, while its mouse clicks have the title.
    let pointer = '';
    const onPointerDown = (e: PointerEvent) => {
      pointer = e.pointerType;
    };
    const onClick = (e: MouseEvent) => {
      const kanji = kanjiAt(e.target);
      // A kanji inside a button or link is part of that control; the tap is for it.
      if (pointer === 'mouse' || !(kanji instanceof HTMLElement) || kanji.closest('button, a')) return;
      setTapped((open) => (open?.el === kanji ? null : { el: kanji, ch: kanji.textContent ?? '', over: kanji.dataset.over }));
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onClick);
    };
  }, []);

  // The kanji's message can be rewound or its chat closed while the popup is open.
  useEffect(() => {
    if (!tapped) return;
    const gone = new MutationObserver(() => {
      if (!tapped.el.isConnected) setTapped(null);
    });
    gone.observe(document.body, { childList: true, subtree: true });
    return () => gone.disconnect();
  }, [tapped]);

  if (!tapped) return null;
  const { ch, over } = tapped;
  const info = kanjiInfo(ch);
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
