import {
  WorkbenchLink,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { type I18nString, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';

import * as styles from './style.css';

interface Tab {
  to: string;
  label: I18nString;
}

const tabs: Tab[] = [
  {
    to: '/all',
    label: 'com.affine.docs.header',
  },
  {
    to: '/collection',
    label: 'com.affine.collections.header',
  },
  {
    to: '/tag',
    label: 'Tags',
  },
];

export const AllDocsTabs = () => {
  const t = useI18n();
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);

  return (
    <ul className={styles.tabs}>
      {tabs.map(tab => {
        return (
          <WorkbenchLink
            data-active={location.pathname === tab.to}
            replaceHistory
            className={styles.tab}
            key={tab.to}
            to={tab.to}
          >
            {t.t(tab.label)}
          </WorkbenchLink>
        );
      })}
    </ul>
  );
};
