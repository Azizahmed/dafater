import { Button } from '@affine/component';
import { Trans, useI18n } from '@affine/i18n';

import * as styles from './animate-in-tooltip.css';

interface AnimateInTooltipProps {
  onNext: () => void;
  visible?: boolean;
}

export const AnimateInTooltip = ({
  onNext,
  visible,
}: AnimateInTooltipProps) => {
  const t = useI18n();
  return (
    <>
      <div className={styles.tooltip}>
        <Trans
          i18nKey="com.affine.onboarding.intro.tooltip"
          components={{ br: <br /> }}
        />
      </div>
      <div className={styles.next}>
        {visible ? (
          <Button variant="primary" size="extraLarge" onClick={onNext}>
            {t['com.affine.onboarding.next']()}
          </Button>
        ) : null}
      </div>
    </>
  );
};
