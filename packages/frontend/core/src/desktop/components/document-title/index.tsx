import { NotificationCountService } from '@affine/core/modules/notification';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

export const DocumentTitle = () => {
  const t = useI18n();
  const brand = t['com.affine.brand.name']();
  const notificationCountService = useService(NotificationCountService);
  const notificationCount = useLiveData(notificationCountService.count$);
  const workbenchService = useService(WorkbenchService);
  const workbenchView = useLiveData(workbenchService.workbench.activeView$);
  const viewTitle = useLiveData(workbenchView.title$);

  useEffect(() => {
    const prefix = notificationCount > 0 ? `(${notificationCount}) ` : '';
    document.title = prefix + (viewTitle ? `${viewTitle} · ${brand}` : brand);

    return () => {
      document.title = brand;
    };
  }, [brand, notificationCount, viewTitle]);

  return null;
};
