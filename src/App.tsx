import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type Chat, type ChatSummary, type Message, type Politeness, type Settings } from '../shared/types.ts';
import { api } from './api.ts';
import { ChatView } from './components/ChatView.tsx';
import { ChatSettingsDialog, type ChatPatch } from './components/ChatSettingsDialog.tsx';
import { NewChatDialog } from './components/NewChatDialog.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { SetupNotice } from './components/SetupNotice.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { LanguageProvider, useT } from './i18n.tsx';
import { useBackToClose } from './back.ts';
import { SettingsContext } from './settings.tsx';

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.settings().then(setSettings, (err: Error) => setLoadError(err.message));
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setSettings(await api.saveSettings(patch));
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.uiLanguage;
  }, [settings.uiLanguage]);

  const state = useMemo(() => ({ settings, update }), [settings, update]);

  return (
    <SettingsContext.Provider value={state}>
      <LanguageProvider language={settings.uiLanguage}>
        <Shell loadError={loadError} />
      </LanguageProvider>
    </SettingsContext.Provider>
  );
}

function Shell({ loadError }: { loadError: string | null }) {
  const t = useT();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [waiting, setWaiting] = useState<Set<string>>(new Set());
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [dialog, setDialog] = useState<'new' | 'settings' | 'chat' | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const activeId = useRef<string | null>(null);

  const refreshList = useCallback(() => api.chats().then(setChats).catch(() => {}), []);

  /**
   * Each chat has its own history entry (#<id>), so Back goes to the previous chat and a reload stays put.
   * An open menu or dialog sits on its own entry (see below); moving to a chat from there takes that entry over.
   */
  const showInUrl = useCallback((id: string | null, replace = false) => {
    const url = id ? `#${id}` : location.pathname + location.search;
    if (id ? location.hash === url : !location.hash) return;
    if (replace || history.state?.overlay) history.replaceState({ chat: id }, '', url);
    else history.pushState({ chat: id }, '', url);
  }, []);

  /** Shows a chat the server returned, if it is still the one on screen. */
  const show = useCallback((next: Chat) => {
    if (activeId.current === next.id) setChat(next);
  }, []);

  const setBusy = useCallback(
    (id: string, busy: boolean) =>
      setWaiting((w) => {
        const next = new Set(w);
        if (busy) next.add(id);
        else next.delete(id);
        return next;
      }),
    [],
  );

  const requestReply = useCallback(async (id: string) => {
    setBusy(id, true);
    setErrors((e) => ({ ...e, [id]: null }));
    try {
      show(await api.reply(id));
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
    } finally {
      setBusy(id, false);
      refreshList();
    }
  }, [show, refreshList, setBusy]);

  const select = useCallback(async (id: string, replace = false) => {
    activeId.current = id;
    showInUrl(id, replace);
    setNavOpen(false);
    try {
      const loaded = await api.chat(id);
      show(loaded);
      // A reply this page didn't ask for (it was reloaded while waiting): wait for it like any other.
      if (loaded.replying && !waitingRef.current.has(id)) requestReply(id);
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
    }
  }, [show, showInUrl, requestReply]);

  useEffect(() => {
    api.chats().then((list) => {
      setChats(list);
      const linked = list.find((c) => `#${c.id}` === location.hash);
      if (linked ?? list[0]) select((linked ?? list[0]).id, true);
    }).catch(() => {});
  }, [select]);

  // Back and Forward between chats.
  useEffect(() => {
    const onPop = () => {
      const id = location.hash.slice(1);
      if (id && id !== activeId.current) select(id, true);
      else if (!id && activeId.current) {
        activeId.current = null;
        setChat(null);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [select]);

  useBackToClose(navOpen, () => setNavOpen(false));

  const startChat = async (topic: string, politeness: Politeness) => {
    setDialog(null);
    const created = await api.createChat(topic, politeness);
    activeId.current = created.id;
    showInUrl(created.id);
    setChat(created);
    setNavOpen(false);
    refreshList();
    requestReply(created.id);
  };

  const send = async (text: string) => {
    if (!chat) return;
    const id = chat.id;
    try {
      show(await api.send(id, text));
      requestReply(id);
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
    }
  };

  /** Applies from the next message; earlier ones keep the settings they were stamped with. */
  const saveChatSettings = async (patch: ChatPatch) => {
    setDialog(null);
    if (!chat) return;
    try {
      show(await api.updateChat(chat.id, patch));
      refreshList();
    } catch (err) {
      setErrors((e) => ({ ...e, [chat.id]: (err as Error).message }));
    }
  };

  /** Deletes the message and everything after it; ChatView then puts its text back in the composer. */
  const rewind = async (m: Message) => {
    if (!chat) return false;
    const id = chat.id;
    try {
      show(await api.rewind(id, m.id));
      setErrors((e) => ({ ...e, [id]: null }));
      return true;
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
      return false;
    }
  };

  const rename = async (id: string, title: string) => {
    show(await api.renameChat(id, title));
    refreshList();
  };

  const remove = async (id: string) => {
    await api.deleteChat(id);
    if (activeId.current === id) {
      activeId.current = null;
      setChat(null);
      showInUrl(null, true);
    }
    refreshList();
  };

  const messageUpdated = (m: Message) =>
    setChat((c) => (c ? { ...c, messages: c.messages.map((x) => (x.id === m.id ? m : x)) } : c));

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar
        chats={chats}
        activeId={chat?.id ?? null}
        onSelect={select}
        onNew={() => setDialog('new')}
        onRename={rename}
        onDelete={remove}
        onSettings={() => setDialog('settings')}
      />
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="main">
        <header className="topbar">
          <button type="button" className="icon-button menu-button" onClick={() => setNavOpen(true)} aria-label={t.menu}>
            ☰
          </button>
          <h1 className="jp">{chat ? chat.title || t.untitled : t.appName}</h1>
          {chat && (
            <button type="button" className="chip chat-settings-button" onClick={() => setDialog('chat')} title={t.chatSettings} aria-label={t.chatSettings}>
              <span>{chat.politeness === 'casual' ? t.casualShort : t.politeShort}</span>
              <span aria-hidden>⚙</span>
            </button>
          )}
          <button type="button" className="icon-button topbar-new" onClick={() => setDialog('new')} aria-label={t.newChat} title={t.newChat}>
            +
          </button>
        </header>
        {loadError && (
          <div className="error">
            {t.errorPrefix} {loadError}
          </div>
        )}
        {chat ? (
          <ChatView
            // A fresh view per chat, so nothing typed or opened in one chat carries over to another.
            key={chat.id}
            chat={chat}
            waiting={waiting.has(chat.id)}
            error={errors[chat.id] ?? null}
            onSend={send}
            onRetry={() => requestReply(chat.id)}
            onMessageUpdated={messageUpdated}
            onRewind={rewind}
          />
        ) : (
          <div className="empty">
            <div className="empty-mark" aria-hidden>
              会話
            </div>
            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyBody}</p>
            <SetupNotice onOpenSettings={() => setDialog('settings')} />
            <button type="button" className="primary" onClick={() => setDialog('new')}>
              + {t.newChat}
            </button>
          </div>
        )}
      </main>
      {dialog === 'new' && <NewChatDialog onStart={startChat} onClose={() => setDialog(null)} onOpenSettings={() => setDialog('settings')} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'chat' && chat && <ChatSettingsDialog chat={chat} onSave={saveChatSettings} onClose={() => setDialog(null)} />}
    </div>
  );
}
