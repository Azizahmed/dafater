import { useI18n } from '@affine/i18n';

import { SettingGroup } from '../group';
import { AppFontSetting } from './app-font';
import { FontStyleSetting } from './font';
import { LanguageSetting } from './language';
import { ThemeSetting } from './theme';

export const AppearanceGroup = () => {
  const t = useI18n();
  return (
    <SettingGroup title={t['com.affine.mobile.setting.appearance.title']()}>
      <ThemeSetting />
      <AppFontSetting />
      <FontStyleSetting />
      <LanguageSetting />
    </SettingGroup>
  );
};
