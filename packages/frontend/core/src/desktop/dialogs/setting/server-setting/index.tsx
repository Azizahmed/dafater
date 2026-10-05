import { AuthService, UserFeatureService } from '@affine/core/modules/cloud';
import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { useI18n } from '@affine/i18n';
import { AiOutlineIcon, GoogleIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import type { SettingSidebarItem } from '../types';
import { ServerAiSetting } from './ai';
import { ServerGoogleSetting } from './google';

/**
 * Dafater: server administration settings. They are only offered to the
 * administrator of the server the settings dialog is scoped to.
 */
export const isServerSetting = (key: string): boolean =>
  key.startsWith('server:');

export const useIsServerAdmin = () => {
  const { authService, userFeatureService } = useServices({
    AuthService,
    UserFeatureService,
  });
  const status = useLiveData(authService.session.status$);
  const isAdmin = useLiveData(userFeatureService.userFeature.isAdmin$);

  useEffect(() => {
    userFeatureService.userFeature.revalidate();
  }, [userFeatureService]);

  return status === 'authenticated' && isAdmin === true;
};

export const useServerSettingList = (): SettingSidebarItem[] => {
  const t = useI18n();
  const isServerAdmin = useIsServerAdmin();

  return useMemo<SettingSidebarItem[]>(
    () =>
      isServerAdmin
        ? [
            {
              key: 'server:ai',
              title: t['com.affine.settings.server-ai.title'](),
              icon: <AiOutlineIcon />,
              testId: 'server-ai-panel-trigger',
            },
            {
              key: 'server:google',
              title: t['com.affine.settings.server-google.title'](),
              icon: <GoogleIcon />,
              testId: 'server-google-panel-trigger',
            },
          ]
        : [],
    [isServerAdmin, t]
  );
};

export const ServerSetting = ({ activeTab }: { activeTab: SettingTab }) => {
  const isServerAdmin = useIsServerAdmin();
  if (!isServerAdmin) {
    return null;
  }
  switch (activeTab) {
    case 'server:ai':
      return <ServerAiSetting />;
    case 'server:google':
      return <ServerGoogleSetting />;
    default:
      return null;
  }
};
