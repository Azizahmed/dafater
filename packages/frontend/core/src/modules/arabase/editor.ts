import { I18n } from '@affine/i18n';
import type { ArabaseEditorLabel, ArabaseTranslate } from '@arabase/blocksuite';

const LABEL_KEYS: Record<ArabaseEditorLabel, string> = {
  'direction.title': 'com.affine.editor.text-direction.title',
  'direction.auto': 'com.affine.editor.text-direction.auto',
  'direction.auto.description':
    'com.affine.editor.text-direction.auto.description',
  'direction.rtl': 'com.affine.editor.text-direction.rtl',
  'direction.rtl.description':
    'com.affine.editor.text-direction.rtl.description',
  'direction.ltr': 'com.affine.editor.text-direction.ltr',
  'direction.ltr.description':
    'com.affine.editor.text-direction.ltr.description',
};

/** Localises arabase editor UI through the app's i18n (resolved at render). */
export const arabaseEditorTranslate: ArabaseTranslate = label =>
  I18n.t(LABEL_KEYS[label]);
