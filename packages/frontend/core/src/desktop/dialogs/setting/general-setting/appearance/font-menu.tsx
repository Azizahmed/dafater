import { Menu, MenuItem, MenuTrigger } from '@affine/component/ui/menu';
import {
  FONT_CHOICES,
  type FontChoice,
  getFont,
  setFont,
  subscribeFont,
} from '@affine/core/modules/arabase';
import { useI18n } from '@affine/i18n';
import { DoneIcon } from '@blocksuite/icons/rc';
import { useSyncExternalStore } from 'react';

/** CSS `font-family` used to preview each choice in its own typeface. */
export const FONT_PREVIEW: Record<FontChoice, string> = {
  thmanyah: '"Thmanyah Sans"',
  noto: '"Noto Sans Arabic", "Arabase Noto Sans Arabic"',
  system: 'var(--arabase-arabic-font)',
};

export const FONT_LABEL_KEYS: Record<FontChoice, string> = {
  thmanyah: 'com.affine.appearanceSettings.font.thmanyah',
  noto: 'com.affine.appearanceSettings.font.noto',
  system: 'com.affine.appearanceSettings.font.system',
};

export const useFont = () => useSyncExternalStore(subscribeFont, getFont);

export const FontMenu = () => {
  const t = useI18n();
  const current = useFont();

  return (
    <Menu
      items={FONT_CHOICES.map(choice => (
        <MenuItem
          key={choice}
          onSelect={() => setFont(choice)}
          data-selected={choice === current}
          data-testid={`font-option-${choice}`}
          suffixIcon={choice === current ? <DoneIcon /> : undefined}
          style={{ fontFamily: FONT_PREVIEW[choice] }}
        >
          {t.t(FONT_LABEL_KEYS[choice])}
        </MenuItem>
      ))}
      contentOptions={{ align: 'end', style: { width: 250 } }}
    >
      <MenuTrigger
        data-testid="font-menu-button"
        style={{
          fontWeight: 600,
          width: '250px',
          fontFamily: FONT_PREVIEW[current],
        }}
        block={true}
      >
        {t.t(FONT_LABEL_KEYS[current])}
      </MenuTrigger>
    </Menu>
  );
};
