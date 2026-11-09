import type { UiError } from '../api.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';

/**
 * A failed reply, analysis or load: what happened and what to try, in plain words, then the technical detail
 * smaller below it. A model's raw answer ("the endpoint answered 500: {...}") meant nothing to a learner. The
 * check-it-is-running hint is only for a model that couldn't be reached, and names the provider that was
 * called -- an analysis uses the one its message was written with, not necessarily today's.
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
  const provider = error.kind === 'model' ? (error.provider ?? settings.provider) : settings.provider;
  const [lead, hint] =
    error.kind === 'server'
      ? [t.serverUnreachable, t.serverUnreachableHint]
      : error.kind === 'model' && error.unreachable
        ? [t.modelFailed, provider === 'claude' ? t.modelFailedClaude : t.modelFailedEndpoint]
        : [t.modelError, t.modelErrorHint];
  return (
    <div className="error" role="alert">
      <strong>{lead}</strong> {hint}
      <span className="error-detail">{error.detail}</span>
    </div>
  );
}
