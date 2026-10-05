import { type I18nInstance, useI18n } from '@affine/i18n';
import {
  type Color,
  ColorScheme,
  FontStyle,
  FontWeight,
  NoteShadow,
  type Palette,
  PointStyle,
  resolveColor,
} from '@blocksuite/affine/model';
import { isEqual } from 'lodash-es';
import { useTheme } from 'next-themes';

export const useResolvedTheme = () => {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === ColorScheme.Dark
    ? ColorScheme.Dark
    : ColorScheme.Light;
};

export const usePalettes = (
  originalPalettes: Palette[],
  defaultColor: Color,
  isShapeText = false
) => {
  const t = useI18n();
  const theme = useResolvedTheme();
  const isDark = theme === ColorScheme.Dark;
  const palettes = originalPalettes.map(({ key, value }) => {
    // Title needs to be inverted.
    if (!isShapeText && isDark) {
      if (key === 'Black') {
        key = 'White';
      } else if (key === 'White') {
        key = 'Black';
      }
    }

    return {
      key,
      label: getPaletteLabel(t, key),
      value,
      resolvedValue: resolveColor(value, theme),
    };
  });
  return {
    palettes,
    getCurrentColor: (color: Color) =>
      palettes.find(({ value }) => isEqual(value, color)) ||
      palettes.find(({ value }) => isEqual(value, defaultColor)),
  };
};

export const sortedFontWeightEntries = Object.entries(FontWeight).sort(
  (a, b) => Number(a[1]) - Number(b[1])
);

const COLOR_LABELS: Record<string, string> = {
  Red: 'com.affine.settings.editorSettings.edgeless.color.red',
  Orange: 'com.affine.settings.editorSettings.edgeless.color.orange',
  Yellow: 'com.affine.settings.editorSettings.edgeless.color.yellow',
  Green: 'com.affine.settings.editorSettings.edgeless.color.green',
  Blue: 'com.affine.settings.editorSettings.edgeless.color.blue',
  Purple: 'com.affine.settings.editorSettings.edgeless.color.purple',
  Magenta: 'com.affine.settings.editorSettings.edgeless.color.magenta',
  Grey: 'com.affine.settings.editorSettings.edgeless.color.grey',
  Black: 'com.affine.settings.editorSettings.edgeless.color.black',
  White: 'com.affine.settings.editorSettings.edgeless.color.white',
  Transparent: 'com.affine.settings.editorSettings.edgeless.color.transparent',
};

const COLOR_TONE_LABELS: Record<string, string> = {
  Light: 'com.affine.settings.editorSettings.edgeless.color.light',
  Medium: 'com.affine.settings.editorSettings.edgeless.color.medium',
  Heavy: 'com.affine.settings.editorSettings.edgeless.color.heavy',
};

/** Palette keys look like `Black` or `MediumBlue` (tone + color). */
export const getPaletteLabel = (t: I18nInstance, key: string) => {
  const tone = /^(Light|Medium|Heavy)(?=[A-Z])/.exec(key)?.[1] ?? '';
  const colorKey = COLOR_LABELS[key.slice(tone.length)];
  if (!colorKey) return key;
  const colorLabel = t.t(colorKey);
  return tone
    ? t.t(COLOR_TONE_LABELS[tone], { color: colorLabel })
    : colorLabel;
};

const FONT_WEIGHT_LABELS: Record<string, string> = {
  [FontWeight.Light]:
    'com.affine.settings.editorSettings.edgeless.text.font-weight.light',
  [FontWeight.Regular]:
    'com.affine.settings.editorSettings.edgeless.text.font-weight.regular',
  [FontWeight.Medium]:
    'com.affine.settings.editorSettings.edgeless.text.font-weight.medium',
  [FontWeight.SemiBold]:
    'com.affine.settings.editorSettings.edgeless.text.font-weight.semibold',
  [FontWeight.Bold]:
    'com.affine.settings.editorSettings.edgeless.text.font-weight.bold',
};

export const getFontWeightLabel = (t: I18nInstance, weight: string) =>
  FONT_WEIGHT_LABELS[weight] ? t.t(FONT_WEIGHT_LABELS[weight]) : weight;

const FONT_STYLE_LABELS: Record<string, string> = {
  [FontStyle.Normal]:
    'com.affine.settings.editorSettings.edgeless.text.font-style.normal',
  [FontStyle.Italic]:
    'com.affine.settings.editorSettings.edgeless.text.font-style.italic',
};

export const getFontStyleLabel = (t: I18nInstance, style: string) =>
  FONT_STYLE_LABELS[style] ? t.t(FONT_STYLE_LABELS[style]) : style;

const POINT_STYLE_LABELS: Record<string, string> = {
  [PointStyle.None]:
    'com.affine.settings.editorSettings.edgeless.connecter.endpoint.none',
  [PointStyle.Arrow]:
    'com.affine.settings.editorSettings.edgeless.connecter.endpoint.arrow',
  [PointStyle.Triangle]:
    'com.affine.settings.editorSettings.edgeless.connecter.endpoint.triangle',
  [PointStyle.Circle]:
    'com.affine.settings.editorSettings.edgeless.connecter.endpoint.circle',
  [PointStyle.Diamond]:
    'com.affine.settings.editorSettings.edgeless.connecter.endpoint.diamond',
};

export const getPointStyleLabel = (t: I18nInstance, style: string) =>
  POINT_STYLE_LABELS[style] ? t.t(POINT_STYLE_LABELS[style]) : style;

const NOTE_SHADOW_LABELS: Record<string, string> = {
  [NoteShadow.None]:
    'com.affine.settings.editorSettings.edgeless.note.shadow.none',
  [NoteShadow.Box]:
    'com.affine.settings.editorSettings.edgeless.note.shadow.box',
  [NoteShadow.Sticker]:
    'com.affine.settings.editorSettings.edgeless.note.shadow.sticker',
  [NoteShadow.Paper]:
    'com.affine.settings.editorSettings.edgeless.note.shadow.paper',
  [NoteShadow.Float]:
    'com.affine.settings.editorSettings.edgeless.note.shadow.float',
  [NoteShadow.Film]:
    'com.affine.settings.editorSettings.edgeless.note.shadow.film',
};

export const getNoteShadowLabel = (t: I18nInstance, shadow: string) =>
  NOTE_SHADOW_LABELS[shadow] ? t.t(NOTE_SHADOW_LABELS[shadow]) : shadow;
