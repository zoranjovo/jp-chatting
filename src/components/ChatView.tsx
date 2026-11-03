import { useEffect, useRef, useState } from 'react';
import { stripFurigana } from '../../shared/kanji.ts';
import type { Chat, Message } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { Composer, type ComposerHandle } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';

export function ChatView({
  chat,
  waiting,
  error,
  onSend,
  onRetry,
  onMessageUpdated,
  onRewind,
  focusComposer,
  onComposerFocused,
}: {
  chat: Chat;
  waiting: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRetry: () => void;
  onMessageUpdated: (m: Message) => void;
  /** Resolves true once the message and everything after it are gone. */
  onRewind: (m: Message) => Promise<boolean>;
  /** Moves focus to the composer once (then calls onComposerFocused), e.g. for a chat just started. */
  focusComposer?: boolean;
  onComposerFocused?: () => void;
}) {
  const t = useT();
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle>(null);

  const rewind = async (m: Message) => {
    if (await onRewind(m)) composer.current?.prepend(m.content);
  };
  const last = chat.messages.at(-1);
  const needsReply = !waiting && (!last || last.role === 'user');

  // Screen readers hear the partner's new messages; the ones already there when a chat opens stay quiet.
  const [announcement, setAnnouncement] = useState('');
  const seen = useRef({ chat: chat.id, message: last?.id });
  useEffect(() => {
    const fresh = seen.current.chat === chat.id && last && last.id !== seen.current.message && last.role === 'assistant';
    setAnnouncement(fresh ? `${t.partnerSays} ${stripFurigana(last.content)}` : '');
    seen.current = { chat: chat.id, message: last?.id };
  }, [chat.id, last, t.partnerSays]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages.length, waiting]);

  useEffect(() => {
    if (!focusComposer) return;
    composer.current?.focus();
    onComposerFocused?.();
  }, [focusComposer, onComposerFocused]);

  return (
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
        {needsReply && (
          <button
            type="button"
            className="secondary retry"
            onClick={() => {
              // The button goes away once the reply is asked for; keep the keyboard in the chat.
              composer.current?.focus();
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
      <Composer chatId={chat.id} disabled={waiting} onSend={onSend} handle={composer} />
    </div>
  );
}
