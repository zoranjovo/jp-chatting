import { useEffect, useRef } from 'react';
import type { Chat, Message } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { Composer } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';

export function ChatView({
  chat,
  waiting,
  error,
  onSend,
  onRetry,
  onMessageUpdated,
}: {
  chat: Chat;
  waiting: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRetry: () => void;
  onMessageUpdated: (m: Message) => void;
}) {
  const t = useT();
  const end = useRef<HTMLDivElement>(null);
  const last = chat.messages.at(-1);
  const needsReply = !waiting && (!last || last.role === 'user');

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.messages.length, waiting]);

  return (
    <div className="chat">
      <div className="messages">
        {chat.topic && <div className="topic-banner">{chat.topic}</div>}
        {chat.messages.map((m) => (
          <MessageBubble key={m.id} chatId={chat.id} message={m} onUpdated={onMessageUpdated} />
        ))}
        {waiting && (
          <div className="message theirs">
            <div className="bubble typing" aria-label={t.typing}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        {error && (
          <div className="error">
            {t.errorPrefix} {error}
          </div>
        )}
        {needsReply && (error || chat.messages.length === 0) && (
          <button type="button" className="secondary retry" onClick={onRetry}>
            {t.retryReply}
          </button>
        )}
        <div ref={end} />
      </div>
      <Composer disabled={waiting} onSend={onSend} />
    </div>
  );
}
