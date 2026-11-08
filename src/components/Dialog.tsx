import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useBackToClose } from '../back.ts';

/** Matches the dialog-out animation in styles.css. */
const CLOSE_MS = 140;

/** Animates the dialog out, then calls `then` (by default the dialog's onClose). */
export type CloseDialog = (then?: () => void) => void;

/**
 * A modal on the native <dialog>, so Escape and focus trapping come for free. It is unmounted to close,
 * which would cut the exit animation short, so its buttons close through `close` (children as a function)
 * and whatever they do happens once the dialog has faded out.
 */
export function Dialog({
  title,
  onClose,
  small,
  describedBy,
  children,
}: {
  title: string;
  onClose: () => void;
  small?: boolean;
  /** The id of the element that explains the dialog (a confirmation's question), read out after the title. */
  describedBy?: string;
  children: ReactNode | ((close: CloseDialog) => ReactNode);
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  // A ref as well as the state: a `close` from an earlier render (one awaited in a submit handler) must still see it.
  const closed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A layout effect, so the cleanup's close() runs while the dialog is still in the document and the
  // browser can hand focus back to whatever opened it.
  useLayoutEffect(() => {
    const el = ref.current;
    el?.showModal();
    // On a touch screen, focusing a text field pops the keyboard up over the dialog's buttons before the
    // learner has seen it: focus the dialog itself, and let a tap on a field bring the keyboard.
    if (window.matchMedia('(pointer: coarse)').matches) el?.focus();
    return () => {
      clearTimeout(timer.current);
      el?.close();
    };
  }, []);

  const close: CloseDialog = (then = onClose) => {
    if (closed.current) return;
    closed.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return then();
    setClosing(true);
    timer.current = setTimeout(then, CLOSE_MS);
  };
  useBackToClose(true, () => close());

  return (
    <dialog
      ref={ref}
      className={`dialog ${small ? 'small' : ''} ${closing ? 'closing' : ''}`}
      aria-labelledby={titleId}
      tabIndex={-1}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-body">
        <h2 id={titleId}>{title}</h2>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </dialog>
  );
}

/** A yes/no question. Escape and a click on the backdrop answer no; Cancel has the focus, so Enter does too. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const messageId = useId();
  return (
    <Dialog title={title} onClose={onCancel} small describedBy={messageId}>
      {(close) => (
        <>
          <p className="dialog-message" id={messageId}>
            {message}
          </p>
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={() => close()}>
              {cancelLabel}
            </button>
            <button type="button" className="primary" onClick={() => close(onConfirm)}>
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
