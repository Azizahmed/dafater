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
};

const errorMessage = (error: unknown) =>
  UserFriendlyError.fromAny(error).message;

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
    });
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
        <div className={styles.result} role="status">
          <div className={styles.resultTitle} data-ok={testResult.ok}>
            {testResult.ok
              ? t['com.affine.settings.server-ai.test.success']({
                  latency: String(testResult.latencyMs),
                })
              : testResult.errorCode
                ? testErrorText[testResult.errorCode]
                : t['com.affine.settings.server-ai.test.failed']()}
          </div>
          {testResult.ok && testResult.sampleText ? (
            <div className={styles.resultDetail} dir="auto">
              {t['com.affine.settings.server-ai.test.sample']({
                text: testResult.sampleText,
              })}
            </div>
          ) : null}
          {!testResult.ok && testResult.error ? (
            <div className={styles.resultDetail} dir="auto">
              {testResult.error}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};
