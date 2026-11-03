import { useState, type FormEvent } from 'react';
import type { Politeness } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { needsModel, useSettings } from '../settings.tsx';
import { type CloseDialog, Dialog } from './Dialog.tsx';
import { SetupNotice } from './SetupNotice.tsx';

export function NewChatDialog({
  onStart,
  onClose,
  onOpenSettings,
}: {
  onStart: (topic: string, politeness: Politeness) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const t = useT();
  const blocked = needsModel(useSettings().settings);
  const [topic, setTopic] = useState('');
  const [politeness, setPoliteness] = useState<Politeness>('polite');

  const submit = (e: FormEvent, close: CloseDialog) => {
    e.preventDefault();
    if (blocked) return;
    close(() => onStart(topic.trim(), politeness));
  };

  return (
    <Dialog title={t.newChatTitle} onClose={onClose}>
      {(close) => (
        <form onSubmit={(e) => submit(e, close)} className="form">
          <SetupNotice onOpenSettings={() => close(onOpenSettings)} />
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
          <div className="field">
            <span>{t.politeness}</span>
            <StyleSwitch value={politeness} onChange={setPoliteness} />
            <small className="muted">{t.speechStyleHint}</small>
          </div>
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={() => close()}>
              {t.cancel}
            </button>
            <button type="submit" className="primary" disabled={blocked}>
              {t.start}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Polite / casual as a two-way switch. */
export function StyleSwitch({ value, onChange }: { value: Politeness; onChange: (p: Politeness) => void }) {
  const t = useT();
  const options: [Politeness, string][] = [
    ['polite', t.polite],
    ['casual', t.casual],
  ];
  return (
    <div className="segmented" role="radiogroup" aria-label={t.politeness}>
      {options.map(([p, label]) => (
        <label key={p} className={value === p ? 'active' : ''}>
          <input type="radio" checked={value === p} onChange={() => onChange(p)} />
          {label}
        </label>
      ))}
    </div>
  );
}
