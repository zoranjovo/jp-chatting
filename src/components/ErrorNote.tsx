import type { UiError } from '../api.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';

/**
 * A failed reply or analysis: what happened and what to try, in plain words, then the technical detail
 * smaller below it. A model's raw answer ("the endpoint answered 500: {...}") meant nothing to a learner.
 */
export function ErrorNote({ error }: { error: UiError }) {
  const t = useT();
  const { settings } = useSettings();
  if (error.kind === 'other') {
    return (
      <div className="error" role="alert">
        {t.errorPrefix} {error.detail}
      </div>
    );
  }
  const [lead, hint] =
    error.kind === 'model'
      ? [t.modelFailed, settings.provider === 'claude' ? t.modelFailedClaude : t.modelFailedEndpoint]
      : [t.serverUnreachable, t.serverUnreachableHint];
  return (
    <div className="error" role="alert">
      <strong>{lead}</strong> {hint}
      <span className="error-detail">{error.detail}</span>
    </div>
  );
}
