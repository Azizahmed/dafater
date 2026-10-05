export const DEFAULT_LABELS = {
  'direction.title': 'Text direction',
  'direction.auto': 'Automatic',
  'direction.auto.description': 'Follow the language of the text.',
  'direction.rtl': 'Right to left',
  'direction.rtl.description': 'Write this block from right to left.',
  'direction.ltr': 'Left to right',
  'direction.ltr.description': 'Write this block from left to right.',
} as const;

export type ArabaseEditorLabel = keyof typeof DEFAULT_LABELS;

/**
 * Supplied by the host app to localise editor UI. It is called at render
 * time, so language switches apply without re-creating the editor.
 */
export type ArabaseTranslate = (label: ArabaseEditorLabel) => string;

export const defaultTranslate: ArabaseTranslate = label =>
  DEFAULT_LABELS[label];
