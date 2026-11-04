import { useT } from '../i18n.tsx';
import { useNeedsModel } from '../settings.tsx';

/** Says the partner can't reply yet, and offers Settings, while no model is chosen. */
export function SetupNotice({ onOpenSettings }: { onOpenSettings: () => void }) {
  const t = useT();
  if (!useNeedsModel()) return null;
  return (
    <div className="notice setup-notice" role="note">
      <strong className="notice-title">{t.noModelTitle}</strong>
      <p>{t.noModelBody}</p>
      <button type="button" className="secondary" onClick={onOpenSettings}>
        {t.openSettings}
      </button>
    </div>
  );
}
