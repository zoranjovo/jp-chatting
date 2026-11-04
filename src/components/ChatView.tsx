import { useEffect, useRef } from 'react';
import type { Chat, Message } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { Composer, type ComposerHandle } from './Composer.tsx';
import { MessageBubble } from './MessageBubble.tsx';
import { SetupNotice } from './SetupNotice.tsx';

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
  onSend: (text: string) => void;
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
    if (await onRewind(m)) composer.current?.prepend(m.content);
  };
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
        {needsReply && <SetupNotice onOpenSettings={onOpenSettings} />}
        {needsReply && (error || chat.messages.length === 0) && (
          <button type="button" className="secondary retry" onClick={onRetry}>
            {t.retryReply}
          </button>
        )}
        <div ref={end} />
      </div>
      <Composer disabled={waiting} onSend={onSend} handle={composer} />
    </div>
  );
}
