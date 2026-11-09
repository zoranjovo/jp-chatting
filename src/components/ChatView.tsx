import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { kanjiKnownIn, stripFurigana } from '../../shared/kanji.ts';
import type { Chat, Message } from '../../shared/types.ts';
import { AnnounceContext } from '../announce.ts';
import { useBreakdownHint } from '../hints.ts';
import { useT } from '../i18n.tsx';
import { FeedbackView } from './Analysis.tsx';
import { Composer, type ComposerHandle } from './Composer.tsx';
import { KnownKanjiProvider } from './JpText.tsx';
import { MessageBubble } from './MessageBubble.tsx';
import { SetupNotice } from './SetupNotice.tsx';
import { TypingIndicator } from './TypingIndicator.tsx';

/** How long an announcement stays in the status region: long enough to be read, then gone, so it isn't a stray copy. */
const ANNOUNCE_MS = 5000;
/** How long the undo toast stays after a rewind. The rewind stays undoable on the server until the next message. */
const UNDO_MS = 8000;

export function ChatView({
  chat,
  waiting,
  error,
  onSend,
  onRetry,
  onMessageUpdated,
  onRewind,
  onUndoRewind,
  onDismissPinned,
  onOpenSettings,
  focusComposer,
  onComposerFocused,
}: {
  chat: Chat;
  waiting: boolean;
  error: string | null;
  onSend: (text: string) => Promise<boolean>;
  onRetry: () => void;
  onMessageUpdated: (m: Message) => void;
  /** Resolves true once the message and everything after it are gone. */
  onRewind: (m: Message) => Promise<boolean>;
  onUndoRewind: () => void;
  onDismissPinned: () => void;
  onOpenSettings: () => void;
  /** Moves focus to the composer once (then calls onComposerFocused), e.g. for a chat just started. */
  focusComposer?: boolean;
  onComposerFocused?: () => void;
}) {
  const t = useT();
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);

  /** How many messages the last rewind here removed, while its toast is up. */
  const [rewound, setRewound] = useState<number | null>(null);
  const rewind = async (m: Message) => {
    const removed = chat.messages.length - chat.messages.findIndex((x) => x.id === m.id);
    if (!(await onRewind(m))) return;
    setRewound(removed);
    announce(t.rewound(removed));
    // The server put the text at the top of the draft; the caret goes at its end.
    composer.current?.focusAt(m.content.length);
  };
  useEffect(() => {
    if (rewound === null) return;
    const timer = setTimeout(() => setRewound(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [rewound]);
  // Gone once there is nothing left to undo: a message was sent or the partner replied.
  const undoable = rewound !== null && !!chat.undo;
  const last = chat.messages.at(-1);
  const needsReply = !waiting && (!last || last.role === 'user');

  const [announcement, setAnnouncement] = useState<ReactNode>(null);
  const announce = useCallback((text: ReactNode) => setAnnouncement(text), []);
  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => setAnnouncement(null), ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

  // Screen readers hear a partner message that was added -- not the ones there when the chat opened
  // (it remounts per chat), nor an older one that a rewind leaves last.
  const known = useRef(new Set(chat.messages.map((m) => m.id)));
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the last message changes, not on every update to the chat.
  useEffect(() => {
    const added = last?.role === 'assistant' && !known.current.has(last.id);
    known.current = new Set(chat.messages.map((m) => m.id));
    if (added) {
      announce(
        <>
          {t.partnerSays} <span lang="ja">{stripFurigana(last.content)}</span>
        </>,
      );
    }
  }, [last?.id]);

  // Kept at the end when the list gets shorter -- the keyboard coming up resizes the page -- if it was at the end.
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    let atEnd = true;
    let height = el.clientHeight;
    const onScroll = () => {
      const bottom = end.current?.getBoundingClientRect().bottom;
      atEnd = bottom === undefined || bottom <= el.getBoundingClientRect().bottom + 2;
    };
    const resized = new ResizeObserver(() => {
      if (el.clientHeight < height && atEnd) end.current?.scrollIntoView({ block: 'end' });
      height = el.clientHeight;
    });
    el.addEventListener('scroll', onScroll, { passive: true });
    resized.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      resized.disconnect();
    };
  }, []);

  // Straight to the end when the chat opens; smoothly for each new message.
  const opened = useRef(false);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: opened.current ? 'smooth' : 'auto', block: 'end' });
    opened.current = true;
  }, [chat.messages.length, waiting]);

  useEffect(() => {
    if (!focusComposer) return;
    composer.current?.focus();
    onComposerFocused?.();
  }, [focusComposer, onComposerFocused]);

  // Kanji the learner typed anywhere in this chat (the rewound message pinned above the composer included): known, so never marked.
  // The one-time pointer to Breakdown, on the partner's first message: in a chat, the button is only an icon.
  const breakdownHint = useBreakdownHint();
  const firstTheirs = chat.messages.find((m) => m.role === 'assistant')?.id;

  const knownKanji = useMemo(() => kanjiKnownIn({ messages: chat.messages, pinned: chat.pinned }), [chat.messages, chat.pinned]);

  return (
    <AnnounceContext.Provider value={announce}>
      <KnownKanjiProvider value={knownKanji}>
        <div className="chat">
          <div className="messages" ref={list}>
            {chat.topic && <div className="topic-banner">{chat.topic}</div>}
            {chat.messages.map((m) => (
              <MessageBubble
                key={m.id}
                chatId={chat.id}
                message={m}
                onUpdated={onMessageUpdated}
                onRewind={m.role === 'user' ? () => rewind(m) : undefined}
                rewindDisabled={waiting}
                hint={breakdownHint && m.id === firstTheirs}
              />
            ))}
            {waiting && <TypingIndicator chatId={chat.id} />}
            {error && (
              <div className="error" role="alert">
                {t.errorPrefix} {error}
              </div>
            )}
            {needsReply && <SetupNotice onOpenSettings={onOpenSettings} />}
            {needsReply && (
              <button
                type="button"
                className="secondary retry"
                onClick={(e) => {
                  // The button goes away once the reply is asked for: keep the keyboard in the chat. Only from the
                  // keyboard (detail 0) -- a tap would pop up the phone's on-screen keyboard over the reply.
                  if (e.detail === 0) composer.current?.focus();
                  onRetry();
                }}
              >
                {t.retryReply}
              </button>
            )}
            <div ref={end} />
          </div>
          <div className="sr-only" role="status">
            {waiting ? t.typing : announcement}
          </div>
          {(chat.pinned || undoable) && (
            <div className="composer-extras">
              {chat.pinned && (
                <section className="analysis pinned" aria-label={t.pinnedTitle}>
                  <div className="pinned-head">
                    <span>{t.pinnedTitle}</span>
                    <button type="button" className="icon-button" onClick={onDismissPinned} aria-label={t.dismissPinned} title={t.dismissPinned}>
                      ×
                    </button>
                  </div>
                  <FeedbackView feedback={chat.pinned.feedback} />
                </section>
              )}
              {undoable && (
                <div className="undo-toast">
                  <span>{t.rewound(rewound)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRewound(null);
                      onUndoRewind();
                    }}
                  >
                    {t.undo}
                  </button>
                </div>
              )}
            </div>
          )}
          <Composer chatId={chat.id} disabled={waiting} onSend={onSend} handle={composer} />
        </div>
      </KnownKanjiProvider>
    </AnnounceContext.Provider>
  );
}
