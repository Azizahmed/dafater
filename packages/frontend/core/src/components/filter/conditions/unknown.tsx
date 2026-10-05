import type { FilterParams } from '@affine/core/modules/collection-rules';
import { useI18n } from '@affine/i18n';
import { WarningIcon } from '@blocksuite/icons/rc';
import { useEffect } from 'react';

import { Condition } from './condition';
import * as styles from './styles.css';

export const UnknownFilterCondition = ({
  filter,
  isDraft,
  onDraftCompleted,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
}) => {
  const t = useI18n();
  useEffect(() => {
    if (isDraft) {
      // should not reach here
      onDraftCompleted?.();
    }
  }, [isDraft, onDraftCompleted]);

  return (
    <Condition
      filter={filter}
      icon={<WarningIcon className={styles.filterTypeIconUnknownStyle} />}
      name={
        <span className={styles.filterTypeUnknownNameStyle}>
          {t['com.affine.page-properties.property.unknown']()}
        </span>
      }
    />
  );
};
