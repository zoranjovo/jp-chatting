import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { genkiBook, MAX_GENKI_LESSON } from '../../shared/genki.ts';
import { asJlptLevel, JLPT_LEVELS } from '../../shared/jlpt.ts';
import { allowedKanji, MAX_WK_LEVEL } from '../../shared/kanji.ts';
import { DEFAULT_SETTINGS, type ClaudeEffort, type ModelList, type Settings } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';
import { Dialog } from './Dialog.tsx';
import { Reveal } from './Reveal.tsx';

const EFFORTS: ClaudeEffort[] = ['', 'low', 'medium', 'high', 'xhigh', 'max'];

type TestState =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; reply: string; ms: number }
  | { state: 'error'; error: string };

// What the personal-use notice is based on. Re-check both when the terms change, and update the notice's date.
const CONSUMER_TERMS = 'https://www.anthropic.com/legal/consumer-terms';
const CLAUDE_CODE_TERMS = 'https://code.claude.com/docs/en/legal-and-compliance';

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
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetching on every keystroke of the URL is what we avoid
  useEffect(() => {
    loadModels(draft.provider, draft.endpoint);
  }, [draft.provider, loadModels]);

  // A result belongs to the provider and model it was run against; changing either clears it.
  const [test, setTest] = useState<TestState>({ state: 'idle' });
  const testRun = useRef(0);
  const testTarget = `${draft.provider}|${draft.endpoint.baseUrl}|${draft.endpoint.model}|${draft.claude.command}|${draft.claude.model}`;
  useEffect(() => {
    testRun.current += 1;
    setTest({ state: 'idle' });
  }, [testTarget]);

  const runTest = async () => {
    const run = ++testRun.current;
    setTest({ state: 'testing' });
    try {
      const { reply, ms } = await api.testModel({ provider: draft.provider, endpoint: draft.endpoint, claude: draft.claude });
      if (run === testRun.current) setTest({ state: 'ok', reply, ms });
    } catch (err) {
      if (run === testRun.current) setTest({ state: 'error', error: (err as Error).message });
    }
  };

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
          <span>{t.genkiLabel}</span>
          <select value={draft.genkiLesson} onChange={(e) => set('genkiLesson', Number(e.target.value))}>
            <option value={0}>{t.genkiNone}</option>
            {Array.from({ length: MAX_GENKI_LESSON }, (_, i) => i + 1).map((lesson) => (
              <option key={lesson} value={lesson}>
                {t.genkiLesson(genkiBook(lesson), lesson)}
              </option>
            ))}
          </select>
          <small className="muted">{draft.genkiLesson > 0 ? t.genkiHint(draft.genkiLesson) : t.genkiNoneHint}</small>
        </label>

        <label className="field">
          <span>{t.jlptLabel}</span>
          <select value={draft.jlptLevel} onChange={(e) => set('jlptLevel', asJlptLevel(e.target.value))}>
            <option value={0}>{t.jlptNone}</option>
            {JLPT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t.jlptOption(level)}
              </option>
            ))}
          </select>
          <small className="muted">{t.jlptHint}</small>
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

        <Reveal open={draft.provider === 'claude'}>
          <div className="notice" role="note">
            <strong className="notice-title">{t.claudeNoticeTitle}</strong>
            <p>{t.claudeNoticeBody}</p>
            <p className="notice-footnote">
              {t.claudeNoticeFootnote}{' '}
              <a href={CONSUMER_TERMS} target="_blank" rel="noreferrer">
                {t.claudeNoticeConsumerTerms}
              </a>
              {' · '}
              <a href={CLAUDE_CODE_TERMS} target="_blank" rel="noreferrer">
                {t.claudeNoticeCodeTerms}
              </a>
            </p>
          </div>
        </Reveal>

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
              <option value="">{loading ? t.loadingModels : draft.provider === 'claude' ? t.defaultModel(DEFAULT_SETTINGS.claude.model) : t.chooseModel}</option>
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

        <div className="field model-test">
          <div>
            <button type="button" className="secondary" onClick={runTest} disabled={(draft.provider === 'endpoint' && !current) || test.state === 'testing'}>
              {test.state === 'testing' ? t.testingModel : t.testModel}
            </button>
          </div>
          <Reveal open={test.state === 'ok' || test.state === 'error'}>
            <div className={`model-test-result ${test.state}`} role="status">
              {test.state === 'ok' && (
                <>
                  <strong>{t.testModelOk((test.ms / 1000).toFixed(1))}</strong>
                  <span className="model-test-reply">{test.reply}</span>
                </>
              )}
              {test.state === 'error' && (
                <>
                  <strong>{t.testModelFailed}</strong>
                  <span className="model-test-reply">{test.error}</span>
                </>
              )}
            </div>
          </Reveal>
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
