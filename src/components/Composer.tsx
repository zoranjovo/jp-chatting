import { useImperativeHandle, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref } from 'react';
import { useT } from '../i18n.tsx';
import { romajiToKana } from '../romaji.ts';
import { useSettings } from '../settings.tsx';

export interface ComposerHandle {
  /** Puts a rewound message back in the box, above anything already typed. */
  prepend: (message: string) => void;
}

export function Composer({ disabled, onSend, handle }: { disabled: boolean; onSend: (text: string) => void; handle?: Ref<ComposerHandle> }) {
  const t = useT();
  const { settings, update } = useSettings();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const romaji = settings.romajiInput;

  useImperativeHandle(handle, () => ({
    prepend(message) {
      setText((current) => (current.trim() ? `${message}\n\n${current}` : message));
      caret.current = message.length;
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
    const at = e.target.selectionStart ?? value.length;
    const before = romajiToKana(value.slice(0, at));
    caret.current = before.length;
    setText(before + value.slice(at));
  };

  const send = () => {
    const out = (romaji ? romajiToKana(text, true) : text).trim();
    if (!out || disabled) return;
    onSend(out);
    setText('');
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
        onClick={() => update({ romajiInput: !romaji })}
        title={romaji ? t.romajiOn : t.romajiOff}
        aria-pressed={romaji}
      >
        {romaji ? 'あ' : 'A'}
      </button>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={romaji ? t.composerPlaceholderRomaji : t.composerPlaceholder}
        lang="ja"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
      <button type="button" className="send" onClick={send} disabled={disabled || !text.trim()}>
        {t.send}
      </button>
    </div>
  );
}
