import { useState, type FormEvent } from 'react';
import { contextOf } from '../../shared/context.ts';
import type { Chat, Politeness } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';
import { ContextLine } from './ContextLine.tsx';
import { type CloseDialog, Dialog } from './Dialog.tsx';
import { StyleSwitch } from './NewChatDialog.tsx';

export type ChatPatch = Pick<Chat, 'title' | 'topic' | 'politeness'>;

/** The open chat's own settings. The model and levels are app-wide, so they are only shown here. */
export function ChatSettingsDialog({ chat, onSave, onClose }: { chat: Chat; onSave: (patch: ChatPatch) => void; onClose: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [title, setTitle] = useState(chat.title);
  const [topic, setTopic] = useState(chat.topic);
  const [politeness, setPoliteness] = useState<Politeness>(chat.politeness);

  const submit = (e: FormEvent, close: CloseDialog) => {
    e.preventDefault();
    close(() => onSave({ title: title.trim(), topic: topic.trim(), politeness }));
  };

  return (
    <Dialog title={t.chatSettings} onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => submit(e, close)} className="form">
          <label className="field">
            <span>{t.chatTitle}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.untitled} />
          </label>
          <label className="field">
            <span>{t.topicLabel}</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t.topicPlaceholder} />
          </label>
          <div className="field">
            <span>{t.politeness}</span>
            <StyleSwitch value={politeness} onChange={setPoliteness} />
          </div>
          <div className="field">
            <span>{t.chatUses}</span>
            {/* Only what comes from Settings: the speech style is this chat's own, chosen just above. */}
            <ContextLine context={contextOf(settings, politeness)} className="chat-uses" withStyle={false} />
            <small className="muted">{t.chatUsesHint}</small>
          </div>
          <p className="muted small">{t.chatSettingsHint}</p>
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={() => close()}>
              {t.cancel}
            </button>
            <button type="submit" className="primary">
              {t.save}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
