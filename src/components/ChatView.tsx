import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { stripFurigana } from '../../shared/kanji.ts';
import type { Chat, Message } from '../../shared/types.ts';
import { AnnounceContext } from '../announce.ts';
import { prependDraft } from '../drafts.ts';
import { useT } from '../i18n.tsx';
import { Composer, type ComposerHandle } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';
import { SetupNotice } from './SetupNotice.tsx';

/** How long an announcement stays in the status region: long enough to be read, then gone, so it isn't a stray copy. */
const ANNOUNCE_MS = 5000;

export function ChatView({
  chat,
  waiting,
  error,
  onSend,
  onRetry,
  onMessageUpdated,
  onRewind,
  onOpenSettings,
}: {
  chat: Chat;
  waiting: boolean;
  error: string | null;
  onSend: (text: string) => Promise<boolean>;
  onRetry: () => void;
  onMessageUpdated: (m: Message) => void;
  /** Resolves true once the message and everything after it are gone. */
  onRewind: (m: Message) => Promise<boolean>;
  onOpenSettings: () => void;
}) {
  const t = useT();
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);

  const rewind = async (m: Message) => {
    if (!(await onRewind(m))) return;
    // The learner may have switched chats meanwhile; the text still goes to this chat's draft.
    if (composer.current) composer.current.prepend(m.content);
    else prependDraft(chat.id, m.content);
  };
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

  // Straight to the end when the chat opens; smoothly for each new message.
  const opened = useRef(false);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: opened.current ? 'smooth' : 'auto', block: 'end' });
    opened.current = true;
  }, [chat.messages.length, waiting]);

  return (
    <AnnounceContext.Provider value={announce}>
      <div className="chat">
        <div className="messages">
          {chat.topic && <div className="topic-banner">{chat.topic}</div>}
          {chat.messages.map((m) => (
            <MessageBubble
              key={m.id}
              chatId={chat.id}
              message={m}
              onUpdated={onMessageUpdated}
              onRewind={m.role === 'user' ? () => rewind(m) : undefined}
              rewindDisabled={waiting}
            />
          ))}
          {waiting && (
            <div className="message theirs" aria-hidden>
              <div className="bubble typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {t.errorPrefix} {error}
            </div>
          )}
          {needsReply && <SetupNotice onOpenSettings={onOpenSettings} />}
          {needsReply && (
            <button type="button" className="secondary retry" onClick={onRetry}>
              {t.retryReply}
            </button>
          )}
          <div ref={end} />
        </div>
        <div className="sr-only" role="status">
          {waiting ? t.typing : announcement}
        </div>
        <Composer chatId={chat.id} disabled={waiting} onSend={onSend} handle={composer} />
      </div>
    </AnnounceContext.Provider>
  );
}
