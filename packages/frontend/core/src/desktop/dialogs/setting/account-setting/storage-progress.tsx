import { ErrorMessage, Skeleton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useEffect } from 'react';

import { UserQuotaService } from '../../../../modules/cloud';
import * as styles from './storage-progress.css';

/**
 * Cloud storage used / available on the Dafater server. Dafater has no plans
 * or payments, so there is no upgrade / change-plan action.
 */
export const StorageProgress = () => {
  const t = useI18n();
  const quota = useService(UserQuotaService).quota;

  useEffect(() => {
    // revalidate quota to get the latest status
    quota.revalidate();
  }, [quota]);
  const color = useLiveData(quota.color$);
  const usedFormatted = useLiveData(quota.usedFormatted$);
  const maxFormatted = useLiveData(quota.maxFormatted$);
  const percent = useLiveData(quota.percent$);

  const loading = percent === null;
  const loadError = useLiveData(quota.error$);

  if (loading) {
    if (loadError) {
      return (
        <ErrorMessage>{t['com.affine.settings.load-error']()}</ErrorMessage>
      );
    }
    return <Skeleton height={42} />;
  }

  return (
    <div className={styles.storageProgressContainer}>
      <div className={styles.storageProgressWrapper}>
        <div className="storage-progress-desc">
          <span>{t['com.affine.storage.used.hint']()}</span>
          <span>
            {usedFormatted}/{maxFormatted}
          </span>
        </div>

        <div className="storage-progress-bar-wrapper">
          <div
            className={styles.storageProgressBar}
            style={{
              width: `${percent}%`,
              backgroundColor: color ?? cssVar('processingColor'),
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};
