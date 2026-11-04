import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatSummary, UiLanguage } from '../../shared/types.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';
import { type CloseDialog, ConfirmDialog, Dialog } from './Dialog.tsx';

export function Sidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onSettings,
}: {
  chats: ChatSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  /** Resolves once the chat is deleted and the list refreshed; rejects if the delete failed. */
  onDelete: (id: string) => Promise<void>;
  onSettings: () => void;
}) {
  const t = useT();
  const { settings, update } = useSettings();

  const [renaming, setRenaming] = useState<ChatSummary | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);

  // Once a deleted chat has left the list, focus its neighbour (or New chat) rather than leave focus on the page.
  const aside = useRef<HTMLElement>(null);
  /** Set only once the delete has succeeded: the deleted chat, and the neighbour (from the list as it was) to focus. */
  const [refocus, setRefocus] = useState<{ gone: string; next: string | null } | null>(null);
  useEffect(() => {
    if (!refocus || chats.some((c) => c.id === refocus.gone)) return;
    setRefocus(null);
    // Only if focus went with the dialog -- not if the learner has since moved on, say into the composer.
    const active = document.activeElement;
    if (active && active !== document.body && !aside.current?.contains(active)) return;
    const index = chats.findIndex((c) => c.id === refocus.next);
    const items = aside.current?.querySelectorAll<HTMLButtonElement>('.chat-item-main');
    const next = (index >= 0 ? items?.[index] : undefined) ?? aside.current?.querySelector<HTMLButtonElement>('.new-chat');
    next?.focus();
  }, [refocus, chats]);

  const setLanguage = (uiLanguage: UiLanguage) => update({ uiLanguage });

  return (
    <aside className="sidebar" ref={aside}>
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          話
        </span>
        {t.appName}
      </div>
      <button type="button" className="primary new-chat" onClick={onNew}>
        + {t.newChat}
      </button>
      <nav className="chat-list">
        {chats.length === 0 && <p className="muted small">{t.noChats}</p>}
        {chats.map((chat) => (
          <div key={chat.id} className={`chat-item ${chat.id === activeId ? 'active' : ''}`}>
            <button type="button" className="chat-item-main" onClick={() => onSelect(chat.id)}>
              <span className="chat-title jp">{chat.title || t.untitled}</span>
              <span className="chat-date">{new Date(chat.updatedAt).toLocaleDateString(settings.uiLanguage === 'ja' ? 'ja-JP' : 'en-GB', { month: 'short', day: 'numeric' })}</span>
            </button>
            <div className="chat-item-actions">
              <button type="button" className="icon-button" onClick={() => setRenaming(chat)} title={t.renameChat} aria-label={t.renameChat}>
                ✎
              </button>
              <button type="button" className="icon-button" onClick={() => setDeleting(chat)} title={t.deleteChat} aria-label={t.deleteChat}>
                ×
              </button>
            </div>
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="lang-switch" role="group" aria-label={t.uiLanguage}>
          <button type="button" className={settings.uiLanguage === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>
            EN
          </button>
          <button type="button" className={settings.uiLanguage === 'ja' ? 'active' : ''} onClick={() => setLanguage('ja')}>
            日本語
          </button>
        </div>
        <button type="button" className="secondary" onClick={onSettings}>
          ⚙ {t.settings}
        </button>
      </div>
      {renaming && (
        <RenameDialog
          chat={renaming}
          onSave={(title) => {
            onRename(renaming.id, title);
            setRenaming(null);
          }}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t.deleteChat}
          message={t.confirmDelete(deleting.title || t.untitled)}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          onConfirm={() => {
            const gone = deleting.id;
            const i = chats.findIndex((c) => c.id === gone);
            const next = (chats[i + 1] ?? chats[i - 1])?.id ?? null;
            setDeleting(null);
            onDelete(gone).then(
              () => setRefocus({ gone, next }),
              () => {},
            );
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </aside>
  );
}

function RenameDialog({ chat, onSave, onClose }: { chat: ChatSummary; onSave: (title: string) => void; onClose: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(chat.title);

  const submit = (e: FormEvent, close: CloseDialog) => {
    e.preventDefault();
    if (title.trim()) close(() => onSave(title.trim()));
  };

  return (
    <Dialog title={t.renameChat} onClose={onClose} small>
      {(close) => (
        <form onSubmit={(e) => submit(e, close)} className="form">
          <label className="field">
            <span>{t.chatTitle}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} placeholder={t.untitled} />
          </label>
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={() => close()}>
              {t.cancel}
            </button>
            <button type="submit" className="primary" disabled={!title.trim()}>
              {t.save}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
