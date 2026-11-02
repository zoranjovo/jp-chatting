import { useState, type FormEvent } from 'react';
import { useT } from '../i18n.tsx';
import { Dialog } from './Dialog.tsx';

export function NewChatDialog({ onStart, onClose }: { onStart: (topic: string) => void; onClose: () => void }) {
  const t = useT();
  const [topic, setTopic] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onStart(topic.trim());
  };

  return (
    <Dialog title={t.newChatTitle} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>{t.topicLabel}</span>
          <input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t.topicPlaceholder} />
        </label>
        <div className="topic-examples">
          {t.topicExamples.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => setTopic(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <p className="muted small">{t.topicHint}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="primary">
            {t.start}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
