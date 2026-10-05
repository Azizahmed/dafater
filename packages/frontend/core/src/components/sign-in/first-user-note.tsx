import { ServerService } from '@affine/core/modules/cloud';
import { ServerDeploymentType } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { AdminIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

import * as styles from './style.css';

/**
 * Whether the current server is a Dafater (self-hosted) server that has no
 * users yet: the first account created on it becomes the administrator.
 *
 * Re-fetches the server config on mount, so the flag is fresh even if the
 * app was loaded before someone else signed up.
 */
export function useIsFirstUserOnServer() {
  const serverService = useService(ServerService);
  const server = serverService.server;
  const isFirstUser = useLiveData(
    server.config$.selector(
      c => c.type === ServerDeploymentType.Selfhosted && c.initialized === false
    )
  );

  useEffect(() => {
    server.revalidateConfig();
  }, [server]);

  return isFirstUser;
}

export const FirstUserNote = () => {
  const t = useI18n();
  return (
    <div
      className={styles.firstUserNote}
      role="note"
      data-testid="sign-up-first-user-note"
    >
      <AdminIcon className={styles.firstUserNoteIcon} />
      <span>{t['com.affine.auth.sign-up.first-user-hint']()}</span>
    </div>
  );
};
