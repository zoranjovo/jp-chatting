import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { allowedKanji, MAX_WK_LEVEL } from '../../shared/kanji.ts';
import type { ClaudeEffort, ModelList, Settings } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';
import { Dialog } from './Dialog.tsx';

const EFFORTS: ClaudeEffort[] = ['', 'low', 'medium', 'high', 'xhigh', 'max'];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState<Settings>(settings);
  const [models, setModels] = useState<ModelList | null>(null);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setEndpoint = (patch: Partial<Settings['endpoint']>) => setDraft((d) => ({ ...d, endpoint: { ...d.endpoint, ...patch } }));
  const setClaude = (patch: Partial<Settings['claude']>) => setDraft((d) => ({ ...d, claude: { ...d.claude, ...patch } }));

  const loadModels = useCallback(async (provider: Settings['provider'], endpoint: Settings['endpoint']) => {
    setLoading(true);
    try {
      setModels(await api.models(provider, endpoint));
    } catch (err) {
      setModels({ models: [], error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch the list when the dialog opens and when the provider changes; the endpoint URL waits for "Refresh".
  useEffect(() => {
    loadModels(draft.provider, draft.endpoint);
  }, [draft.provider, loadModels]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await update(draft);
    onClose();
  };

  const current = draft.provider === 'claude' ? draft.claude.model : draft.endpoint.model;
  const options = models?.models ?? [];
  const kanjiCount = allowedKanji(draft.wkLevel).length;

  return (
    <Dialog title={t.settingsTitle} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <h3>{t.sectionLearning}</h3>
        <label className="field">
          <span>{t.uiLanguage}</span>
          <select value={draft.uiLanguage} onChange={(e) => set('uiLanguage', e.target.value as Settings['uiLanguage'])}>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>

        <label className="field">
          <span>
            {t.wkLevelLabel}: <strong>{draft.wkLevel}</strong>
          </span>
          <div className="level-row">
            <input type="range" min={0} max={MAX_WK_LEVEL} value={draft.wkLevel} onChange={(e) => set('wkLevel', Number(e.target.value))} />
            <input
              type="number"
              min={0}
              max={MAX_WK_LEVEL}
              value={draft.wkLevel}
              onChange={(e) => set('wkLevel', Math.max(0, Math.min(MAX_WK_LEVEL, Number(e.target.value) || 0)))}
            />
          </div>
          <small className="muted">{t.wkLevelHint(draft.wkLevel, kanjiCount)}</small>
        </label>

        <label className="field">
          <span>{t.politeness}</span>
          <select value={draft.politeness} onChange={(e) => set('politeness', e.target.value as Settings['politeness'])}>
            <option value="polite">{t.polite}</option>
            <option value="casual">{t.casual}</option>
          </select>
        </label>

        <label className="check">
          <input type="checkbox" checked={draft.furigana} onChange={(e) => set('furigana', e.target.checked)} />
          {t.furigana}
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.romajiInput} onChange={(e) => set('romajiInput', e.target.checked)} />
          {t.romajiInput}
        </label>

        <h3>{t.sectionAi}</h3>
        <div className="field">
          <span>{t.provider}</span>
          <div className="segmented">
            <label className={draft.provider === 'endpoint' ? 'active' : ''}>
              <input type="radio" name="provider" checked={draft.provider === 'endpoint'} onChange={() => set('provider', 'endpoint')} />
              {t.providerEndpoint}
            </label>
            <label className={draft.provider === 'claude' ? 'active' : ''}>
              <input type="radio" name="provider" checked={draft.provider === 'claude'} onChange={() => set('provider', 'claude')} />
              {t.providerClaude}
            </label>
          </div>
        </div>

        {draft.provider === 'endpoint' ? (
          <>
            <label className="field">
              <span>{t.baseUrl}</span>
              <input value={draft.endpoint.baseUrl} onChange={(e) => setEndpoint({ baseUrl: e.target.value })} placeholder="http://localhost:1234/v1" />
              <small className="muted">{t.baseUrlHint}</small>
            </label>
            <label className="field">
              <span>{t.apiKey}</span>
              <input type="password" value={draft.endpoint.apiKey} onChange={(e) => setEndpoint({ apiKey: e.target.value })} autoComplete="off" />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>{t.claudeCommand}</span>
              <input value={draft.claude.command} onChange={(e) => setClaude({ command: e.target.value })} placeholder="claude" />
              <small className="muted">{t.claudeHint}</small>
            </label>
            <label className="field">
              <span>{t.effort}</span>
              <select value={draft.claude.effort} onChange={(e) => setClaude({ effort: e.target.value as ClaudeEffort })}>
                {EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    {e || t.effortDefault}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        <div className="field">
          <span>{t.model}</span>
          <div className="model-row">
            <select
              aria-label={t.model}
              value={current}
              onChange={(e) => (draft.provider === 'claude' ? setClaude({ model: e.target.value }) : setEndpoint({ model: e.target.value }))}
            >
              <option value="">{loading ? t.loadingModels : t.chooseModel}</option>
              {current && !options.includes(current) && <option value={current}>{current}</option>}
              {options.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button type="button" className="secondary" onClick={() => loadModels(draft.provider, draft.endpoint)} disabled={loading}>
              ↻ {t.refreshModels}
            </button>
          </div>
          {models?.error && (
            <small className="error-text">
              {t.modelsError} {models.error}
            </small>
          )}
          {models && !models.error && !loading && options.length === 0 && <small className="muted">{t.noModels}</small>}
        </div>

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="primary">
            {t.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
