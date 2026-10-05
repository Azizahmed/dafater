import { useI18n } from '@affine/i18n';
import type { HTMLAttributes, ReactNode } from 'react';

import { settingHeader, settingHeaderBeta } from './share.css';

interface SettingHeaderProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'title'
> {
  title: ReactNode;
  subtitle?: ReactNode;
  beta?: boolean;
}

export const SettingHeader = ({
  title,
  subtitle,
  beta,
  ...otherProps
}: SettingHeaderProps) => {
  const t = useI18n();
  return (
    <div className={settingHeader} {...otherProps}>
      <div className="title">
        {title}
        {beta ? (
          <div className={settingHeaderBeta}>
            {t['com.affine.settings.beta']()}
          </div>
        ) : null}
      </div>
      {subtitle ? <div className="subtitle">{subtitle}</div> : null}
    </div>
  );
};
