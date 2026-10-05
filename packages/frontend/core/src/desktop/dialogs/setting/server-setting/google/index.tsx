import { Button, Input, notify } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { FetchService, ServerService } from '@affine/core/modules/cloud';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { CopyIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import * as styles from '../ai/styles.css';
import {
  getServerGoogleConfig,
  saveServerGoogleConfig,
  type ServerGoogleConfig,
} from './api';

const errorMessage = (error: unknown) =>
  UserFriendlyError.fromAny(error).message;

/**
 * Dafater: the server administrator turns on "Sign in with Google". Anyone
 * can then register or sign in with a Google account; the first account on
 * the server still becomes its administrator.
 */
export const ServerGoogleSetting = () => {
  const t = useI18n();
  const fetchService = useService(FetchService);
  const serverService = useService(ServerService);

  const [stored, setStored] = useState<ServerGoogleConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);

  const apply = useCallback((config: ServerGoogleConfig) => {
    setStored(config);
    setClientId(config.clientId);
    setClientSecret('');
  }, []);

  useEffect(() => {
    let cancelled = false;
    getServerGoogleConfig(fetchService)
      .then(config => {
        if (!cancelled) apply(config);
      })
      .catch(error => {
        if (!cancelled) setLoadError(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [apply, fetchService]);

  const save = useCallback(
    async (input: { clientId: string; clientSecret?: string }) => {
      setSaving(true);
      try {
        apply(await saveServerGoogleConfig(fetchService, input));
        // refresh the sign-in options so the Google button shows up right away
        serverService.server.revalidateConfig();
        notify.success({
          title: t['com.affine.settings.server-google.saved'](),
        });
      } catch (error) {
        notify.error({
          title: t['com.affine.settings.server-google.save-failed'](),
          message: errorMessage(error),
        });
      } finally {
        setSaving(false);
      }
    },
    [apply, fetchService, serverService, t]
  );

  const onCopy = useCallback(() => {
    if (!stored) return;
    navigator.clipboard
      .writeText(stored.callbackUrl)
      .then(() =>
        notify.success({
          title: t['com.affine.settings.server-google.copied'](),
        })
      )
      .catch(() => {});
  }, [stored, t]);

  const header = (
    <SettingHeader
      title={t['com.affine.settings.server-google.title']()}
      subtitle={t['com.affine.settings.server-google.subtitle']()}
    />
  );

  if (loadError) {
    return (
      <>
        {header}
        <div className={styles.error} role="alert">
          {loadError}
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
      <SettingWrapper>
        <SettingRow
          name={t['com.affine.settings.server-google.status.name']()}
          desc={
            stored.enabled
              ? t['com.affine.settings.server-google.status.on']()
              : t['com.affine.settings.server-google.status.off']()
          }
        >
          {stored.enabled ? (
            <Button
              variant="secondary"
              onClick={() => void save({ clientId: '' })}
              loading={saving}
              disabled={saving}
              data-testid="server-google-disable"
            >
              {t['com.affine.settings.server-google.disable']()}
            </Button>
          ) : null}
        </SettingRow>
        <SettingRow
          name={t['com.affine.settings.server-google.callback.name']()}
          desc={t['com.affine.settings.server-google.callback.desc']()}
          spreadCol={false}
        >
          <div className={styles.field} style={{ display: 'flex', gap: 8 }}>
            <Input
              value={stored.callbackUrl}
              readOnly
              dir="ltr"
              data-testid="server-google-callback"
            />
            <Button variant="secondary" prefix={<CopyIcon />} onClick={onCopy}>
              {t['com.affine.settings.server-google.copy']()}
            </Button>
          </div>
        </SettingRow>
        <SettingRow
          name={t['com.affine.settings.server-google.client-id.name']()}
          desc={t['com.affine.settings.server-google.client-id.desc']()}
          spreadCol={false}
        >
          <div className={styles.field}>
            <Input
              value={clientId}
              onChange={setClientId}
              placeholder="1234567890-xxxx.apps.googleusercontent.com"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              data-testid="server-google-client-id"
            />
          </div>
        </SettingRow>
        <SettingRow
          name={t['com.affine.settings.server-google.client-secret.name']()}
          desc={t['com.affine.settings.server-google.client-secret.desc']()}
          spreadCol={false}
        >
          <div className={styles.field}>
            <Input
              value={clientSecret}
              onChange={setClientSecret}
              placeholder={
                stored.hasClientSecret
                  ? t['com.affine.settings.server-ai.api-key.configured']()
                  : 'GOCSPX-…'
              }
              type="password"
              dir="ltr"
              autoComplete="new-password"
              spellCheck={false}
              data-testid="server-google-client-secret"
            />
          </div>
        </SettingRow>
      </SettingWrapper>

      <div className={styles.note}>
        {t['com.affine.settings.server-google.help']()}
      </div>

      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => void save({ clientId, clientSecret })}
          loading={saving}
          disabled={saving || !clientId.trim()}
          data-testid="server-google-save"
        >
          {t['com.affine.settings.server-google.save']()}
        </Button>
      </div>
    </>
  );
};
