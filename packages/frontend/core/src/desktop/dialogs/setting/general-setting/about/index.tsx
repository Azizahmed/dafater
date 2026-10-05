import { Switch } from '@affine/component';
import { DafaterLogo } from '@affine/component/dafater-logo';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useAppUpdater } from '@affine/core/components/hooks/use-app-updater';
import { useI18n } from '@affine/i18n';
import { useCallback } from 'react';

import { useAppSettingHelper } from '../../../../../components/hooks/affine/use-app-setting-helper';
import * as styles from './style.css';
import { UpdateCheckSection } from './update-check-section';

/**
 * Dafater "About": logo, name and versions only. No AFFiNE website,
 * community, changelog or legal links, and no telemetry toggle (Dafater sends
 * no telemetry). Update settings only exist on desktop builds with an update
 * feed (`BUILD_CONFIG.enableUpdater`, off by default).
 */
export const AboutAffine = () => {
  const t = useI18n();
  const appName = t['com.affine.brand.name']();

  return (
    <>
      <SettingHeader
        title={t['com.affine.aboutAFFiNE.title']()}
        subtitle={t['com.affine.aboutAFFiNE.subtitle']()}
        data-testid="about-title"
      />
      <SettingWrapper title={t['com.affine.aboutAFFiNE.version.title']()}>
        <SettingRow
          name={appName}
          desc={BUILD_CONFIG.appVersion}
          className={styles.appImageRow}
        >
          <DafaterLogo size={56} aria-label={appName} />
        </SettingRow>
        <SettingRow
          name={t['com.affine.aboutAFFiNE.version.editor.title']()}
          desc={BUILD_CONFIG.editorVersion}
        />
        {BUILD_CONFIG.isElectron && BUILD_CONFIG.enableUpdater ? (
          <UpdateSettings />
        ) : null}
      </SettingWrapper>
    </>
  );
};

const UpdateSettings = () => {
  const t = useI18n();
  const { appSettings, updateSettings } = useAppSettingHelper();
  const { toggleAutoCheck, toggleAutoDownload } = useAppUpdater();

  const onSwitchAutoCheck = useCallback(
    (checked: boolean) => {
      toggleAutoCheck(checked);
      updateSettings('autoCheckUpdate', checked);
    },
    [toggleAutoCheck, updateSettings]
  );

  const onSwitchAutoDownload = useCallback(
    (checked: boolean) => {
      toggleAutoDownload(checked);
      updateSettings('autoDownloadUpdate', checked);
    },
    [toggleAutoDownload, updateSettings]
  );

  return (
    <>
      <UpdateCheckSection />
      <SettingRow
        name={t['com.affine.aboutAFFiNE.autoCheckUpdate.title']()}
        desc={t['com.affine.aboutAFFiNE.autoCheckUpdate.description']()}
      >
        <Switch
          checked={appSettings.autoCheckUpdate}
          onChange={onSwitchAutoCheck}
        />
      </SettingRow>
      <SettingRow
        name={t['com.affine.aboutAFFiNE.autoDownloadUpdate.title']()}
        desc={t['com.affine.aboutAFFiNE.autoDownloadUpdate.description']()}
      >
        <Switch
          checked={appSettings.autoDownloadUpdate}
          onChange={onSwitchAutoDownload}
        />
      </SettingRow>
    </>
  );
};
