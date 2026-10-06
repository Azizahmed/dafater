import { Button, Input, notify, RadioGroup, Switch } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { FetchService, ServerService } from '@affine/core/modules/cloud';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getServerAiConfig,
  saveServerAiConfig,
  type ServerAiConfig,
  type ServerAiConfigInput,
  type ServerAiTestErrorCode,
  type ServerAiTestResult,
  testServerAiConfig,
  testServerAiTranscription,
} from './api';
import * as styles from './styles.css';

const EMPTY_FORM: ServerAiConfigInput = {
  enabled: false,
  baseURL: '',
  apiKey: '',
  model: '',
  dialect: 'chat_completions',
  allowPrivateNetwork: false,
  vision: false,
  transcriptionModel: '',
  transcriptionBaseURL: '',
  transcriptionApiKey: '',
};

const errorMessage = (error: unknown) =>
  UserFriendlyError.fromAny(error).message;

const TestResultView = ({
  result,
  successText,
  sampleText,
  errorText,
}: {
  result: ServerAiTestResult;
  successText: string;
  sampleText?: string;
  errorText: string;
}) => (
  <div className={styles.result} role="status">
    <div className={styles.resultTitle} data-ok={result.ok}>
      {result.ok ? successText : errorText}
    </div>
    {result.ok && sampleText ? (
      <div className={styles.resultDetail} dir="auto">
        {sampleText}
      </div>
    ) : null}
    {!result.ok && result.error ? (
      <div className={styles.resultDetail} dir="auto">
        {result.error}
      </div>
    ) : null}
  </div>
);

/**
 * Dafater: the server administrator connects the server's AI to any
 * OpenAI-compatible provider. Every signed-in user can then use AI.
 */
export const ServerAiSetting = () => {
  const t = useI18n();
  const fetchService = useService(FetchService);
  const serverService = useService(ServerService);

  const [stored, setStored] = useState<ServerAiConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ServerAiConfigInput>(EMPTY_FORM);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ServerAiTestResult | null>(null);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);
  const [testingTranscription, setTestingTranscription] = useState(false);
  const [transcriptionResult, setTranscriptionResult] =
    useState<ServerAiTestResult | null>(null);

  const applyConfig = useCallback((config: ServerAiConfig) => {
    setStored(config);
    setForm({
      enabled: config.enabled,
      baseURL: config.baseURL,
      apiKey: '',
      model: config.model,
      dialect: config.dialect,
      allowPrivateNetwork: config.allowPrivateNetwork,
      vision: config.vision,
      transcriptionModel: config.transcriptionModel ?? '',
      transcriptionBaseURL: config.transcriptionBaseURL ?? '',
      transcriptionApiKey: '',
    });
    if (config.transcriptionBaseURL) setTranscriptionOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getServerAiConfig(fetchService)
      .then(config => {
        if (!cancelled) applyConfig(config);
      })
      .catch(error => {
        if (!cancelled) setLoadError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [applyConfig, fetchService]);

  const update = useCallback(
    <K extends keyof ServerAiConfigInput>(
      key: K,
      value: ServerAiConfigInput[K]
    ) => {
      setForm(prev => ({ ...prev, [key]: value }));
      setTestResult(null);
      setTranscriptionResult(null);
    },
    []
  );

  const complete =
    form.baseURL.trim().length > 0 && form.model.trim().length > 0;

  const onTest = useCallback(async () => {
    if (!complete) {
      notify.error({ title: t['com.affine.settings.server-ai.required']() });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testServerAiConfig(fetchService, form));
    } catch (error) {
      setTestResult({ ok: false, latencyMs: 0, error: errorMessage(error) });
    } finally {
      setTesting(false);
    }
  }, [complete, fetchService, form, t]);

  const transcriptionComplete =
    form.transcriptionModel.trim().length > 0 &&
    (form.transcriptionBaseURL.trim().length > 0 ||
      form.baseURL.trim().length > 0);

  const onTestTranscription = useCallback(async () => {
    if (!transcriptionComplete) {
      notify.error({
        title: t['com.affine.settings.server-ai.transcription.required'](),
      });
      return;
    }
    setTestingTranscription(true);
    setTranscriptionResult(null);
    try {
      setTranscriptionResult(
        await testServerAiTranscription(fetchService, form)
      );
    } catch (error) {
      setTranscriptionResult({
        ok: false,
        latencyMs: 0,
        error: errorMessage(error),
      });
    } finally {
      setTestingTranscription(false);
    }
  }, [fetchService, form, t, transcriptionComplete]);

  const onSave = useCallback(async () => {
    if (form.enabled && !complete) {
      notify.error({ title: t['com.affine.settings.server-ai.required']() });
      return;
    }
    setSaving(true);
    try {
      applyConfig(await saveServerAiConfig(fetchService, form));
      // refresh the server features so AI shows up (or hides) right away
      serverService.server.revalidateConfig();
      notify.success({ title: t['com.affine.settings.server-ai.saved']() });
    } catch (error) {
      notify.error({
        title: t['com.affine.settings.server-ai.save-failed'](),
        message: errorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  }, [applyConfig, complete, fetchService, form, serverService, t]);

  const testErrorText = useMemo<Record<ServerAiTestErrorCode, string>>(
    () => ({
      private_network:
        t['com.affine.settings.server-ai.test.error.private-network'](),
      blocked_url: t['com.affine.settings.server-ai.test.error.blocked-url'](),
      timeout: t['com.affine.settings.server-ai.test.error.timeout'](),
      unauthorized:
        t['com.affine.settings.server-ai.test.error.unauthorized'](),
      not_found: t['com.affine.settings.server-ai.test.error.not-found'](),
      http_error: t['com.affine.settings.server-ai.test.error.http'](),
      network_error: t['com.affine.settings.server-ai.test.error.network'](),
      invalid_response:
        t['com.affine.settings.server-ai.test.error.invalid-response'](),
    }),
    [t]
  );

  const transcriptionErrorText = useMemo<Record<ServerAiTestErrorCode, string>>(
    () => ({
      ...testErrorText,
      timeout:
        t['com.affine.settings.server-ai.transcription.test.error.timeout'](),
      not_found:
        t['com.affine.settings.server-ai.transcription.test.error.not-found'](),
    }),
    [t, testErrorText]
  );

  const dialectItems = useMemo(
    () => [
      {
        value: 'chat_completions',
        label: t['com.affine.settings.server-ai.dialect.chat-completions'](),
      },
      {
        value: 'responses',
        label: t['com.affine.settings.server-ai.dialect.responses'](),
      },
    ],
    [t]
  );

  const header = (
    <SettingHeader
      title={t['com.affine.settings.server-ai.title']()}
      subtitle={t['com.affine.settings.server-ai.subtitle']()}
    />
  );

  if (loadError) {
    return (
      <>
        {header}
        <div className={styles.error} role="alert">
          {t['com.affine.settings.server-ai.load-failed']({
            error: loadError,
          })}
        </div>
      </>
    );
  }

  if (!stored) {
    return (
      <>
        {header}
        <div className={styles.loading}>
          {t['com.affine.settings.server-ai.loading']()}
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <SettingWrapper title={t['com.affine.settings.server-ai.provider']()}>
        <SettingRow
          name={t['com.affine.settings.server-ai.enabled.name']()}
          desc={t['com.affine.settings.server-ai.enabled.desc']()}
        >
          <Switch
            checked={form.enabled}
            onChange={checked => update('enabled', checked)}
            data-testid="server-ai-enabled"
          />
        </SettingRow>
        <SettingRow
          name={t['com.affine.settings.server-ai.base-url.name']()}
          desc={t['com.affine.settings.server-ai.base-url.desc']()}
          spreadCol={false}
        >
          <div className={styles.field}>
            <Input
              value={form.baseURL}
              onChange={value => update('baseURL', value)}
              placeholder="https://api.openai.com/v1"
              type="url"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              data-testid="server-ai-base-url"
            />
          </div>
        </SettingRow>
        <SettingRow
          name={t['com.affine.settings.server-ai.api-key.name']()}
          desc={t['com.affine.settings.server-ai.api-key.desc']()}
          spreadCol={false}
        >
          <div className={styles.field}>
            <Input
              value={form.apiKey ?? ''}
              onChange={value => update('apiKey', value)}
              placeholder={
                stored.hasApiKey
                  ? t['com.affine.settings.server-ai.api-key.configured']()
                  : 'sk-…'
              }
              type="password"
              dir="ltr"
              autoComplete="new-password"
              spellCheck={false}
              data-testid="server-ai-api-key"
            />
          </div>
        </SettingRow>
        <SettingRow
          name={t['com.affine.settings.server-ai.model.name']()}
          desc={t['com.affine.settings.server-ai.model.desc']()}
          spreadCol={false}
        >
          <div className={styles.field}>
            <Input
              value={form.model}
              onChange={value => update('model', value)}
              placeholder="gpt-4o-mini"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              data-testid="server-ai-model"
            />
          </div>
        </SettingRow>
      </SettingWrapper>

      <SettingWrapper>
        <button
          type="button"
          className={styles.advancedToggle}
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen(open => !open)}
          data-testid="server-ai-advanced"
        >
          {t['com.affine.settings.server-ai.advanced']()}
          <span className={styles.advancedChevron} data-open={advancedOpen}>
            <ArrowDownSmallIcon />
          </span>
        </button>
        {advancedOpen ? (
          <div className={styles.advancedBody}>
            <SettingRow
              name={t['com.affine.settings.server-ai.dialect.name']()}
              desc={t['com.affine.settings.server-ai.dialect.desc']()}
            >
              <RadioGroup
                items={dialectItems}
                value={form.dialect}
                onChange={(value: ServerAiConfigInput['dialect']) =>
                  update('dialect', value)
                }
                width={260}
              />
            </SettingRow>
            <SettingRow
              name={t['com.affine.settings.server-ai.private-network.name']()}
              desc={t['com.affine.settings.server-ai.private-network.desc']()}
            >
              <Switch
                checked={form.allowPrivateNetwork}
                onChange={checked => update('allowPrivateNetwork', checked)}
                data-testid="server-ai-private-network"
              />
            </SettingRow>
            <SettingRow
              name={t['com.affine.settings.server-ai.vision.name']()}
              desc={t['com.affine.settings.server-ai.vision.desc']()}
            >
              <Switch
                checked={form.vision}
                onChange={checked => update('vision', checked)}
                data-testid="server-ai-vision"
              />
            </SettingRow>
          </div>
        ) : null}
      </SettingWrapper>

      <SettingWrapper
        title={t['com.affine.settings.server-ai.transcription.title']()}
      >
        <div className={styles.sectionDesc}>
          {t['com.affine.settings.server-ai.transcription.desc']()}
        </div>
        <SettingRow
          name={t['com.affine.settings.server-ai.transcription.model.name']()}
          desc={t['com.affine.settings.server-ai.transcription.model.desc']()}
          spreadCol={false}
        >
          <div className={styles.field}>
            <Input
              value={form.transcriptionModel}
              onChange={value => update('transcriptionModel', value)}
              placeholder="whisper-1"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              data-testid="server-ai-transcription-model"
            />
          </div>
        </SettingRow>
        <button
          type="button"
          className={styles.advancedToggle}
          aria-expanded={transcriptionOpen}
          onClick={() => setTranscriptionOpen(open => !open)}
          data-testid="server-ai-transcription-separate"
        >
          {t['com.affine.settings.server-ai.transcription.separate']()}
          <span
            className={styles.advancedChevron}
            data-open={transcriptionOpen}
          >
            <ArrowDownSmallIcon />
          </span>
        </button>
        {transcriptionOpen ? (
          <div className={styles.advancedBody}>
            <SettingRow
              name={t[
                'com.affine.settings.server-ai.transcription.base-url.name'
              ]()}
              desc={t[
                'com.affine.settings.server-ai.transcription.base-url.desc'
              ]()}
              spreadCol={false}
            >
              <div className={styles.field}>
                <Input
                  value={form.transcriptionBaseURL}
                  onChange={value => update('transcriptionBaseURL', value)}
                  placeholder={t[
                    'com.affine.settings.server-ai.transcription.base-url.placeholder'
                  ]()}
                  type="url"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  data-testid="server-ai-transcription-base-url"
                />
              </div>
            </SettingRow>
            <SettingRow
              name={t[
                'com.affine.settings.server-ai.transcription.api-key.name'
              ]()}
              desc={t[
                'com.affine.settings.server-ai.transcription.api-key.desc'
              ]()}
              spreadCol={false}
            >
              <div className={styles.field}>
                <Input
                  value={form.transcriptionApiKey ?? ''}
                  onChange={value => update('transcriptionApiKey', value)}
                  placeholder={
                    stored.hasTranscriptionApiKey
                      ? t['com.affine.settings.server-ai.api-key.configured']()
                      : 'sk-…'
                  }
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  spellCheck={false}
                  data-testid="server-ai-transcription-api-key"
                />
              </div>
            </SettingRow>
          </div>
        ) : null}
        <div className={styles.sectionActions}>
          <Button
            variant="secondary"
            onClick={() => void onTestTranscription()}
            loading={testingTranscription}
            disabled={testingTranscription || saving}
            data-testid="server-ai-transcription-test"
          >
            {t['com.affine.settings.server-ai.transcription.test']()}
          </Button>
        </div>
        {transcriptionResult ? (
          <TestResultView
            result={transcriptionResult}
            successText={t[
              'com.affine.settings.server-ai.transcription.test.success'
            ]({ latency: String(transcriptionResult.latencyMs) })}
            sampleText={
              transcriptionResult.sampleText
                ? t['com.affine.settings.server-ai.transcription.test.sample']({
                    text: transcriptionResult.sampleText,
                  })
                : undefined
            }
            errorText={
              transcriptionResult.errorCode
                ? transcriptionErrorText[transcriptionResult.errorCode]
                : t['com.affine.settings.server-ai.test.failed']()
            }
          />
        ) : null}
      </SettingWrapper>

      <div className={styles.note}>
        {t['com.affine.settings.server-ai.limitations']()}
      </div>

      <div className={styles.actions}>
        <Button
          variant="secondary"
          onClick={() => void onTest()}
          loading={testing}
          disabled={testing || saving}
          data-testid="server-ai-test"
        >
          {t['com.affine.settings.server-ai.test']()}
        </Button>
        <Button
          variant="primary"
          onClick={() => void onSave()}
          loading={saving}
          disabled={saving}
          data-testid="server-ai-save"
        >
          {t['com.affine.settings.server-ai.save']()}
        </Button>
      </div>

      {testResult ? (
        <TestResultView
          result={testResult}
          successText={t['com.affine.settings.server-ai.test.success']({
            latency: String(testResult.latencyMs),
          })}
          sampleText={
            testResult.sampleText
              ? t['com.affine.settings.server-ai.test.sample']({
                  text: testResult.sampleText,
                })
              : undefined
          }
          errorText={
            testResult.errorCode
              ? testErrorText[testResult.errorCode]
              : t['com.affine.settings.server-ai.test.failed']()
          }
        />
      ) : null}
    </>
  );
};
