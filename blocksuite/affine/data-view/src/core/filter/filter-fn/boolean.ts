import { t } from '@blocksuite/global/i18n';

import { t as types } from '../../logical/type-presets.js';
import { createFilter } from './create.js';

export const booleanFilter = [
  createFilter({
    name: 'isChecked',
    self: types.boolean.instance(),
    args: [],
    label: 'Is checked',
    shortString: () => `: ${t('Checked')}`,
    impl: value => {
      return !!value;
    },
    defaultValue: () => true,
  }),
  createFilter({
    name: 'isUnchecked',
    self: types.boolean.instance(),
    args: [],
    label: 'Is unchecked',
    shortString: () => `: ${t('Unchecked')}`,
    impl: value => {
      return !value;
    },
    defaultValue: () => false,
  }),
];
