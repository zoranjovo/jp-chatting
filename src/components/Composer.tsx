import { useImperativeHandle, useLayoutEffect, useReducer, useRef, type ChangeEvent, type KeyboardEvent, type Ref } from 'react';
import { prependDraft, useDraft } from '../drafts.ts';
import { useT } from '../i18n.tsx';
import { romajiAtCaret, romajiWordsToKana } from '../romaji.ts';
import { useSettings } from '../settings.tsx';

/**
 * The あ/A switch, per chat, for this page load. Settings has the default; switching to A for one English
 * question used to switch every chat, and stay that way until noticed.
 */
const romajiInChat = new Map<string, boolean>();

/** Where `next` differs from `prev`: the text put in place of `prev.slice(start, prevEnd)`. */
function changedSpan(prev: string, next: string): { start: number; prevEnd: number; inserted: string } {
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start += 1;
  let tail = 0;
  while (tail < prev.length - start && tail < next.length - start && prev[prev.length - 1 - tail] === next[next.length - 1 - tail]) tail += 1;
  return { start, prevEnd: prev.length - tail, inserted: next.slice(start, next.length - tail) };
}

export interface ComposerHandle {
  /** Focuses the box with the caret at `at`, e.g. at the end of a rewound message now at its top. */
  focusAt: (at: number) => void;
  focus: () => void;
}

export function Composer({
  chatId,
  disabled,
  onSend,
  handle,
}: {
  chatId: string;
  disabled: boolean;
  /** Resolves false if the message wasn't stored; its text then goes back in the box. */
  onSend: (text: string) => Promise<boolean>;
  handle?: Ref<ComposerHandle>;
}) {
  const t = useT();
  const { settings } = useSettings();
  // The chat's own draft, read by id, so the text can never belong to another chat.
  const [text, setText] = useDraft(chatId);
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const romaji = romajiInChat.get(chatId) ?? settings.romajiInput;

  useImperativeHandle(handle, () => ({
    focusAt(at) {
      caret.current = at;
      ref.current?.focus();
      ref.current?.setSelectionRange(at, at);
    },
    focus() {
      ref.current?.focus();
    },
  }), []);

  // Keep the caret where the user was typing after a conversion changes the text's length.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    // Leave a real IME alone mid-composition.
    if (!romaji || (e.nativeEvent as InputEvent).isComposing) return setText(value);
    const { start, inserted } = changedSpan(text, value);
    if (inserted.length > 1) {
      // Arrived at once (pasted, dropped, a keyboard's suggestion): each word converted if it is all romaji.
      const kana = romajiWordsToKana(inserted);
      caret.current = start + kana.length;
      return setText(value.slice(0, start) + kana + value.slice(start + inserted.length));
    }
    const at = e.target.selectionStart ?? value.length;
    const before = romajiAtCaret(value.slice(0, at));
    caret.current = before.length;
    setText(before + value.slice(at));
  };

  const send = async () => {
    const out = (romaji ? romajiWordsToKana(text) : text).trim();
    if (!out || disabled) return;
    setText('');
    if (!(await onSend(out))) prependDraft(chatId, out);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="composer">
      <button
        type="button"
        className={`romaji-toggle ${romaji ? 'on' : ''}`}
        onClick={() => {
          romajiInChat.set(chatId, !romaji);
          rerender();
        }}
        // Named by the glyph it shows then what it does, so a voice command for what is on screen works;
        // aria-pressed carries the state. No title: it would only say the name again as a description.
        aria-pressed={romaji}
      >
        {romaji ? 'あ' : 'A'}
        <span className="sr-only"> {t.romajiInput}</span>
      </button>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={romaji ? t.composerPlaceholderRomaji : t.composerPlaceholder}
        aria-label={t.composerLabel}
        lang="ja"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="send"
        onClick={(e) => {
          send();
          // Sending empties the box, which disables this button and would drop keyboard focus to the page.
          if (e.detail === 0) ref.current?.focus();
        }}
        disabled={disabled || !text.trim()}
      >
        {t.send}
      </button>
    </div>
  );
}
