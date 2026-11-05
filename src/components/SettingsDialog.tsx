import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { genkiBook, MAX_GENKI_LESSON } from '../../shared/genki.ts';
import { asJlptLevel, JLPT_LEVELS } from '../../shared/jlpt.ts';
import { allowedKanji, MAX_WK_LEVEL, parseWkLevel } from '../../shared/kanji.ts';
import { CLAUDE_EFFORTS, ENDPOINT_REASONING, needsModel, type ClaudeEffort, type EndpointReasoning, type ModelList, type Settings } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useT } from '../i18n.tsx';
import { useSettings } from '../settings.tsx';
import { type CloseDialog, Dialog } from './Dialog.tsx';
import { Reveal } from './Reveal.tsx';

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

  // While the number box is being typed in it shows the text as typed, so it can be emptied and retyped; the level
  // follows whenever the text is a number. Otherwise it shows the level itself, so nothing can leave the two apart.
  const [wkTyped, setWkTyped] = useState<string | null>(null);

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
    if (test.state === 'testing') return;
    const run = ++testRun.current;
    setTest({ state: 'testing' });
    try {
      const { reply, ms } = await api.testModel({ provider: draft.provider, endpoint: draft.endpoint, claude: draft.claude });
      if (run === testRun.current) setTest({ state: 'ok', reply, ms });
    } catch (err) {
      if (run === testRun.current) setTest({ state: 'error', error: (err as Error).message });
    }
  };

  const submit = async (e: FormEvent, close: CloseDialog) => {
    e.preventDefault();
    await update(draft);
    close();
  };

  const current = draft.provider === 'claude' ? draft.claude.model : draft.endpoint.model;
  const options = models?.models ?? [];
  const kanjiCount = allowedKanji(draft.wkLevel).length;
  const wkIds = { label: useId(), slider: useId(), hint: useId() };

  return (
    <Dialog title={t.settingsTitle} onClose={onClose}>
      {(close) => (
        // noValidate: the level box may hold "2.5" or "-3" mid-edit; the level it stands for is already clamped.
        <form onSubmit={(e) => submit(e, close)} className="form" noValidate>
          <h3>{t.sectionLearning}</h3>
          <Field label={t.uiLanguage}>
            {(a11y) => (
              <select {...a11y} value={draft.uiLanguage} onChange={(e) => set('uiLanguage', e.target.value as Settings['uiLanguage'])}>
                <option value="en">English</option>
                <option value="ja">日本語</option>
              </select>
            )}
          </Field>

          {/* Two controls for one level: a group named by the heading, each control with a name of its own. */}
          <div className="field" role="group" aria-labelledby={wkIds.label}>
            <label className="field-label" id={wkIds.label} htmlFor={wkIds.slider}>
              {t.wkLevelLabel}: <strong>{draft.wkLevel}</strong>
            </label>
            <div className="level-row">
              <input
                id={wkIds.slider}
                type="range"
                min={0}
                max={MAX_WK_LEVEL}
                value={draft.wkLevel}
                onChange={(e) => set('wkLevel', Number(e.target.value))}
                aria-label={t.wkLevelLabel}
                aria-describedby={wkIds.hint}
              />
              <input
                type="number"
                min={0}
                max={MAX_WK_LEVEL}
                value={wkTyped ?? String(draft.wkLevel)}
                onChange={(e) => {
                  setWkTyped(e.target.value);
                  const level = parseWkLevel(e.target.value);
                  if (level !== null) set('wkLevel', level);
                }}
                onBlur={() => setWkTyped(null)}
                aria-label={t.wkLevelNumber}
                aria-describedby={wkIds.hint}
              />
            </div>
            <small className="muted" id={wkIds.hint}>
              {t.wkLevelHint(draft.wkLevel, kanjiCount)}
            </small>
          </div>

          <Field label={t.genkiLabel} hint={draft.genkiLesson > 0 ? t.genkiHint(draft.genkiLesson) : t.genkiNoneHint}>
            {(a11y) => (
              <select {...a11y} value={draft.genkiLesson} onChange={(e) => set('genkiLesson', Number(e.target.value))}>
                <option value={0}>{t.genkiNone}</option>
                {Array.from({ length: MAX_GENKI_LESSON }, (_, i) => i + 1).map((lesson) => (
                  <option key={lesson} value={lesson}>
                    {t.genkiLesson(genkiBook(lesson), lesson)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label={t.jlptLabel} hint={t.jlptHint}>
            {(a11y) => (
              <select {...a11y} value={draft.jlptLevel} onChange={(e) => set('jlptLevel', asJlptLevel(e.target.value))}>
                <option value={0}>{t.jlptNone}</option>
                {JLPT_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t.jlptOption(level)}
                  </option>
                ))}
              </select>
            )}
          </Field>

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
              <Field label={t.baseUrl} hint={t.baseUrlHint}>
                {(a11y) => (
                  <input
                    {...a11y}
                    value={draft.endpoint.baseUrl}
                    onChange={(e) => setEndpoint({ baseUrl: e.target.value })}
                    placeholder="http://localhost:1234/v1"
                  />
                )}
              </Field>
              <Field label={t.apiKey}>
                {(a11y) => (
                  <input
                    {...a11y}
                    type="password"
                    value={draft.endpoint.apiKey}
                    onChange={(e) => setEndpoint({ apiKey: e.target.value })}
                    autoComplete="off"
                  />
                )}
              </Field>
              <Field label={t.thinking} hint={t.thinkingHint}>
                {(a11y) => (
                  <select
                    {...a11y}
                    value={draft.endpoint.reasoning}
                    onChange={(e) => setEndpoint({ reasoning: e.target.value as EndpointReasoning })}
                  >
                    {ENDPOINT_REASONING.map((r) => (
                      <option key={r} value={r}>
                        {t.thinkingOption(r)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </>
          ) : (
            <>
              <Field label={t.claudeCommand} hint={t.claudeHint}>
                {(a11y) => (
                  <input {...a11y} value={draft.claude.command} onChange={(e) => setClaude({ command: e.target.value })} placeholder="claude" />
                )}
              </Field>
              <Field label={t.effort}>
                {(a11y) => (
                  <select {...a11y} value={draft.claude.effort} onChange={(e) => setClaude({ effort: e.target.value as ClaudeEffort })}>
                    {CLAUDE_EFFORTS.map((e) => (
                      <option key={e} value={e}>
                        {t.effortOption(e)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
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
                {draft.provider !== 'claude' && <option value="">{loading ? t.loadingModels : t.chooseModel}</option>}
                {current && !options.includes(current) && <option value={current}>{current}</option>}
                {options.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {/* aria-disabled rather than disabled while busy: a disabled button drops keyboard focus to the page. */}
              <button
                type="button"
                className="secondary"
                onClick={() => !loading && loadModels(draft.provider, draft.endpoint)}
                aria-disabled={loading}
              >
                ↻ {t.refreshModels}
              </button>
            </div>
            {models?.error && (
              <small className="error-text">
                {t.modelsError} {models.error}
              </small>
            )}
            {models && !models.error && !loading && options.length === 0 && <small className="muted">{t.noModels}</small>}
            {/* Only when nothing above already explains the empty picker. */}
            {needsModel(draft) && !loading && !models?.error && options.length > 0 && <small className="warn-text">{t.noModelWarning}</small>}
          </div>

          <div className="field model-test">
            <div>
              <button type="button" className="secondary" onClick={runTest} disabled={!current} aria-disabled={test.state === 'testing'}>
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
            <button type="button" className="secondary" onClick={() => close()}>
              {t.cancel}
            </button>
            <button type="submit" className="primary">
              {t.save}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/**
 * A labelled control. The label names the control alone and the hint describes it: a <label> wrapped round
 * both would run the hint (and a select's chosen option) into the control's name.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: (a11y: { id: string; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-describedby': hint ? hintId : undefined })}
      {hint && (
        <small className="muted" id={hintId}>
          {hint}
        </small>
      )}
    </div>
  );
}
