import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type Chat, type ChatSummary, type Message, type Politeness, type Settings } from '../shared/types.ts';
import { api } from './api.ts';
import { ChatView } from './components/ChatView.tsx';
import { ChatSettingsDialog, type ChatPatch } from './components/ChatSettingsDialog.tsx';
import { NewChatDialog } from './components/NewChatDialog.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { BreakdownIcon, CheckIcon } from './components/Icons.tsx';
import { SetupNotice } from './components/SetupNotice.tsx';
import { getDraft, replaceDraft, seedDraft, setDraft, setDraftSaver, takeDraft } from './drafts.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { LanguageProvider, useT } from './i18n.tsx';
import { onHistory, useBackToClose, whenSettled } from './back.ts';
import { NARROW, useMediaQuery } from './layout.ts';
import { SettingsContext } from './settings.tsx';

// A save that fails (the chat was deleted meanwhile, the server stopped) leaves the text in the box to try again.
setDraftSaver((chatId, text) => {
  api.saveDraft(chatId, text).catch(() => {});
});

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.settings().then(
      (s) => {
        setSettings(s);
        setLoaded(true);
      },
      (err: Error) => setLoadError(err.message),
    );
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setSettings(await api.saveSettings(patch));
  }, []);

  useEffect(() => {
    document.documentElement.lang = settings.uiLanguage;
  }, [settings.uiLanguage]);

  const state = useMemo(() => ({ settings, loaded, update }), [settings, loaded, update]);

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
  /** Chats whose reply arrived while the learner was in another one, until they open it. */
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [dialog, setDialog] = useState<'new' | 'settings' | 'chat' | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  /** The chat just started, whose composer should take focus once it shows; cleared once it has. */
  const [focusChat, setFocusChat] = useState<string | null>(null);
  const composerFocused = useCallback(() => setFocusChat(null), []);
  const activeId = useRef<string | null>(null);
  const narrow = useMediaQuery(NARROW);
  const drawer = narrow && navOpen;
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);

  // Widening the window (say, rotating a tablet) leaves no drawer to be open; it mustn't spring open again when narrowed.
  useEffect(() => {
    if (!narrow) setNavOpen(false);
  }, [narrow]);

  // The drawer, as a keyboard sees it: opening it moves focus in, Escape closes it, and closing it
  // brings focus back to the menu button unless something else (a dialog, the composer) has taken it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (drawer) sidebar.current?.querySelector<HTMLElement>('button')?.focus();
    else if (wasOpen.current) {
      const at = document.activeElement;
      if (!at || at === document.body || sidebar.current?.contains(at)) menuButton.current?.focus();
    }
    wasOpen.current = drawer;
  }, [drawer]);
  useEffect(() => {
    if (!drawer || dialog) return;
    const onKey = (e: KeyboardEvent) => {
      // Not when something else answers this Escape: a dialog (the sidebar's own Rename and Delete too), or an IME.
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || document.querySelector('dialog[open]')) return;
      setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer, dialog]);

  // A dialog opened from the menu hands focus back, on closing, to a button that went with the menu: put it
  // on the menu button. After the commit, so the dialog has closed and the browser has moved focus.
  const hadDialog = useRef(false);
  useEffect(() => {
    if (hadDialog.current && !dialog && narrow && !navOpen) {
      const at = document.activeElement;
      if (!at || at === document.body || sidebar.current?.contains(at)) menuButton.current?.focus();
    }
    hadDialog.current = dialog !== null;
  }, [dialog, narrow, navOpen]);

  const refreshList = useCallback(() => api.chats().then(setChats).catch(() => {}), []);

  /** The newest copy of each chat the server has sent, so a slow load can tell a reply landed meanwhile. */
  const latest = useRef(new Map<string, Chat>());
  /** The chat being loaded; a later select overtakes it. */
  const selecting = useRef<string | null>(null);
  /** Chats whose reply this page is waiting for, updated at once so two callers in one tick can't both ask. */
  const pending = useRef(new Set<string>());

  /**
   * Each chat has its own history entry (#<id>), so Back goes to the previous chat and a reload stays put.
   * An open menu or dialog sits on its own entry (back.ts); moving to a chat from there takes that entry over.
   * Waits for any entry a closing overlay is taking off, so it never writes over the wrong one.
   */
  const showInUrl = useCallback(
    (id: string | null, replace = false) =>
      whenSettled(() => {
        const url = id ? `#${id}` : location.pathname + location.search;
        if (id ? location.hash === url : !location.hash) return;
        if (replace || history.state?.overlay !== undefined) history.replaceState(null, '', url);
        else history.pushState(null, '', url);
      }),
    [],
  );

  /** Shows a chat the server returned, if it is still the one on screen. */
  const show = useCallback((next: Chat) => {
    latest.current.set(next.id, next);
    seedDraft(next.id, next.draft ?? '');
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
    if (pending.current.has(id)) return;
    pending.current.add(id);
    setBusy(id, true);
    setErrors((e) => ({ ...e, [id]: null }));
    try {
      show(await api.reply(id));
      if (activeId.current !== id) setUnread((u) => new Set(u).add(id));
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
    } finally {
      pending.current.delete(id);
      setBusy(id, false);
      refreshList();
    }
  }, [show, refreshList, setBusy]);

  /** Moves to a chat once it has loaded; if it can't be (deleted, or a bad link), stays on the chat shown. */
  const select = useCallback(async (id: string, replace = false) => {
    selecting.current = id;
    setNavOpen(false);
    const before = latest.current.get(id);
    let loaded: Chat;
    try {
      loaded = await api.chat(id);
    } catch (err) {
      if (selecting.current !== id) return;
      selecting.current = null;
      const here = activeId.current;
      showInUrl(here, true);
      if (here) setErrors((e) => ({ ...e, [here]: (err as Error).message }));
      return;
    }
    if (selecting.current !== id) return;
    selecting.current = null;
    activeId.current = id;
    setUnread((u) => {
      if (!u.has(id)) return u;
      const next = new Set(u);
      next.delete(id);
      return next;
    });
    showInUrl(id, replace);
    // A reply landed while this was loading: it is newer than what was read.
    const newer = latest.current.get(id);
    if (newer && newer !== before) return show(newer);
    show(loaded);
    // A reply this page didn't ask for (it was reloaded while waiting): wait for it like any other.
    if (loaded.replying) requestReply(id);
  }, [show, showInUrl, requestReply]);

  useEffect(() => {
    api.chats().then((list) => {
      setChats(list);
      const first = list.find((c) => `#${c.id}` === location.hash) ?? list[0];
      if (first) select(first.id, true);
    }).catch(() => {});
  }, [select]);

  // Back and Forward between chats.
  useEffect(
    () =>
      onHistory((closedOverlay) => {
        // Back only closed a menu or dialog: stay put, and make the entry it landed on name this chat (it may name one since deleted).
        if (closedOverlay) return showInUrl(activeId.current, true);
        const id = location.hash.slice(1);
        if (id && id !== activeId.current) select(id, true);
        else if (!id && activeId.current) {
          activeId.current = null;
          setChat(null);
        }
      }),
    [select, showInUrl],
  );

  useBackToClose(navOpen, () => setNavOpen(false));

  const startChat = async (topic: string, politeness: Politeness) => {
    setDialog(null);
    const created = await api.createChat(topic, politeness);
    selecting.current = null;
    activeId.current = created.id;
    showInUrl(created.id);
    setChat(created);
    setFocusChat(created.id);
    setNavOpen(false);
    refreshList();
    requestReply(created.id);
  };

  const send = async (text: string) => {
    if (!chat) return false;
    const id = chat.id;
    try {
      show(await api.send(id, text));
      requestReply(id);
      return true;
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
      return false;
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

  /** Deletes the message and everything after it; the server puts its text in the draft, above what is typed. */
  const rewind = async (m: Message) => {
    if (!chat) return false;
    const id = chat.id;
    try {
      const saved = await api.rewind(id, m.id, takeDraft(id));
      replaceDraft(id, saved.draft ?? '');
      show(saved);
      setErrors((e) => ({ ...e, [id]: null }));
      refreshList();
      return true;
    } catch (err) {
      // The text typed meanwhile still needs saving.
      setDraft(id, getDraft(id));
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
      return false;
    }
  };

  /** Puts back what the last rewind removed, with the draft and pinned feedback from before it. */
  const undoRewind = async (id: string) => {
    try {
      const saved = await api.undoRewind(id);
      replaceDraft(id, saved.draft ?? '');
      show(saved);
      setErrors((e) => ({ ...e, [id]: null }));
      refreshList();
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: (err as Error).message }));
    }
  };

  const dismissPinned = (id: string) => {
    setChat((c) => (c?.id === id ? { ...c, pinned: undefined } : c));
    api.dismissPinned(id).then(show, () => {});
  };

  const rename = async (id: string, title: string) => {
    show(await api.renameChat(id, title));
    refreshList();
  };

  const remove = async (id: string) => {
    await api.deleteChat(id);
    replaceDraft(id, '');
    latest.current.delete(id);
    if (activeId.current === id) {
      activeId.current = null;
      setChat(null);
      showInUrl(null, true);
    }
    await refreshList();
  };

  /** Closing the menu in the same commit lets the dialog take over its history entry (back.ts). */
  const fromMenu = (d: 'new' | 'settings') => {
    setNavOpen(false);
    setDialog(d);
  };

  const messageUpdated = (m: Message) =>
    setChat((c) => (c ? { ...c, messages: c.messages.map((x) => (x.id === m.id ? m : x)) } : c));

  return (
    <div className={`app ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar
        // Off screen behind the menu: out of the tab order and the accessibility tree until opened.
        inert={narrow && !navOpen}
        asideRef={sidebar}
        chats={chats}
        activeId={chat?.id ?? null}
        waiting={waiting}
        unread={unread}
        onSelect={select}
        // New chat and Settings take over from the menu: left open under them, it would still be there after saving.
        onNew={() => fromMenu('new')}
        onRename={rename}
        onDelete={remove}
        onSettings={() => fromMenu('settings')}
      />
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="main" inert={drawer}>
        <header className="topbar">
          <button
            ref={menuButton}
            type="button"
            className="icon-button menu-button"
            onClick={() => setNavOpen(true)}
            aria-label={t.menu}
            aria-expanded={navOpen}
            aria-controls="sidebar"
          >
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
          <div className="error" role="alert">
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
            onUndoRewind={() => undoRewind(chat.id)}
            onDismissPinned={() => dismissPinned(chat.id)}
            onOpenSettings={() => setDialog('settings')}
            focusComposer={focusChat === chat.id}
            onComposerFocused={composerFocused}
          />
        ) : (
          <div className="empty">
            <div className="empty-mark" aria-hidden>
              会話
            </div>
            <h2>{t.emptyTitle}</h2>
            {/* The buttons are icons on the messages, and touch screens show no tooltips: show each icon with its name. */}
            <p>
              {t.emptyBody(
                <span className="inline-action">
                  <BreakdownIcon />
                  {t.breakdown}
                </span>,
                <span className="inline-action">
                  <CheckIcon />
                  {t.check}
                </span>,
              )}
            </p>
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
