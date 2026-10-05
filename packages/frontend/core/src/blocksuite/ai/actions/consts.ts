import { t } from '@blocksuite/affine/global/i18n';

export const EXCLUDING_COPY_ACTIONS = [
  'brainstormMindmap',
  'expandMindmap',
  'makeItReal',
  'createSlides',
  'createImage',
  'findActions',
  'filterImage',
  'processImage',
];

export const EXCLUDING_REPLACE_ACTIONS = [
  'brainstormMindmap',
  'expandMindmap',
  'makeItReal',
  'createSlides',
  'createImage',
  'filterImage',
  'processImage',
];

export const EXCLUDING_INSERT_ACTIONS = ['generateCaption'];

export const IMAGE_ACTIONS = ['createImage', 'processImage', 'filterImage'];

const commonImageStages = () => [t('Generating image'), t('Rendering image')];

// Getters: the stages are read when an action starts, in the active language.
export const generatingStages: {
  [key in keyof Partial<BlockSuitePresets.AIActions>]: string[];
} = {
  get makeItReal() {
    return [t('Coding for you'), t('Rendering the code')];
  },
  get brainstormMindmap() {
    return [t('Thinking about this topic'), t('Rendering mindmap')];
  },
  get createSlides() {
    return [t('Thinking about this topic'), t('Rendering slides')];
  },
  get createImage() {
    return commonImageStages();
  },
  get processImage() {
    return commonImageStages();
  },
  get filterImage() {
    return commonImageStages();
  },
};

export const INSERT_ABOVE_ACTIONS = ['createHeadings'];
