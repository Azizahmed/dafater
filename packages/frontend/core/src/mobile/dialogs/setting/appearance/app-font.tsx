import {
  FONT_LABEL_KEYS,
  FONT_PREVIEW,
  useFont,
} from '@affine/core/desktop/dialogs/setting/general-setting/appearance/font-menu';
import {
  FONT_CHOICES,
  type FontChoice,
  setFont,
} from '@affine/core/modules/arabase';
import { useI18n } from '@affine/i18n';
import { useMemo } from 'react';

import { SettingDropdownSelect } from '../dropdown-select';
import { RowLayout } from '../row.layout';

/** Typeface of the interface and documents (arabase font choice). */
export const AppFontSetting = () => {
  const t = useI18n();
  const font = useFont();

  const options = useMemo(
    () =>
      FONT_CHOICES.map(choice => ({
        value: choice,
        label: t.t(FONT_LABEL_KEYS[choice]),
        style: { fontFamily: FONT_PREVIEW[choice] },
        testId: `font-option-${choice}`,
      })),
    [t]
  );

  return (
    <RowLayout label={t['com.affine.appearanceSettings.app-font.title']()}>
      <SettingDropdownSelect<FontChoice>
        options={options}
        value={font}
        onChange={setFont}
      />
    </RowLayout>
  );
};
