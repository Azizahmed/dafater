import { t } from '@blocksuite/global/i18n';

import { t as types } from '../../logical/type-presets.js';
import { createFilter } from './create.js';

export const unknownFilter = [
  createFilter({
    name: 'isNotEmpty',
    self: types.unknown.instance(),
    args: [] as const,
    label: 'Is not empty',
    shortString: () => `: ${t('Is not empty')}`,
    impl: self => {
      if (Array.isArray(self)) {
        return self.length > 0;
      }
      if (typeof self === 'string') {
        return !!self;
      }
      return self != null;
    },
  }),
  createFilter({
    name: 'isEmpty',
    self: types.unknown.instance(),
    args: [] as const,
    label: 'Is empty',
    shortString: () => `: ${t('Is empty')}`,
    impl: self => {
      if (Array.isArray(self)) {
        return self.length === 0;
      }
      if (typeof self === 'string') {
        return !self;
      }
      return self == null;
    },
  }),
];
