import { useI18n } from '@affine/i18n';
import { ArrowLeftSmallIcon } from '@blocksuite/icons/rc';
import type { FC } from 'react';

import { mirrorInRtl } from '../../styles';
import type { ButtonProps } from '../../ui/button';
import { Button } from '../../ui/button';

export const BackButton: FC<ButtonProps> = props => {
  const t = useI18n();
  return (
    <Button
      variant="plain"
      style={{
        padding: '2px 8px 2px 0',
      }}
      prefix={<ArrowLeftSmallIcon className={mirrorInRtl} />}
      {...props}
    >
      {t['com.affine.backButton']()}
    </Button>
  );
};
