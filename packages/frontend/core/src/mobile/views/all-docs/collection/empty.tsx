import type { Collection } from '@affine/core/modules/collection';
import { useI18n } from '@affine/i18n';

import { DetailHeader } from './detail';

export const EmptyCollection = ({ collection }: { collection: Collection }) => {
  const t = useI18n();
  return (
    <>
      <DetailHeader collection={collection} />
      {t['com.affine.selectPage.empty']()}
    </>
  );
};
