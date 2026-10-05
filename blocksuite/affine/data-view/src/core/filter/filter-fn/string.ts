import { t } from '@blocksuite/global/i18n';

import { t as types } from '../../logical/type-presets.js';
import { createFilter } from './create.js';

export const stringFilter = [
  createFilter({
    name: 'contains',
    self: types.string.instance(),
    args: [types.string.instance()] as const,
    label: 'Contains',
    shortString: v => (v ? `: ${v.value}` : undefined),
    impl: (self = '', value) => {
      return self.toLowerCase().includes(value.toLowerCase());
    },
    defaultValue: args => args[0],
  }),
  createFilter({
    name: 'doesNoContains',
    self: types.string.instance(),
    args: [types.string.instance()] as const,
    label: 'Does no contains',
    shortString: v =>
      v ? `: ${t('Not {value}', { value: v.value })}` : undefined,
    impl: (self = '', value) => {
      return !self.toLowerCase().includes(value.toLowerCase());
    },
  }),
  createFilter({
    name: 'startsWith',
    self: types.string.instance(),
    args: [types.string.instance()] as const,
    label: 'Starts with',
    shortString: v =>
      v ? `: ${t('Starts with {value}', { value: v.value })}` : undefined,
    impl: (self = '', value) => {
      return self.toLowerCase().startsWith(value.toLowerCase());
    },
    defaultValue: args => args[0],
  }),
  createFilter({
    name: 'endsWith',
    self: types.string.instance(),
    args: [types.string.instance()] as const,
    label: 'Ends with',
    shortString: v =>
      v ? `: ${t('Ends with {value}', { value: v.value })}` : undefined,
    impl: (self = '', value) => {
      return self.toLowerCase().endsWith(value.toLowerCase());
    },
    defaultValue: args => args[0],
  }),
  createFilter({
    name: 'is',
    self: types.string.instance(),
    args: [types.string.instance()] as const,
    label: 'Is',
    shortString: v => (v ? `: ${v.value}` : undefined),
    impl: (self = '', value) => {
      return self.toLowerCase() == value.toLowerCase();
    },
    defaultValue: args => args[0],
  }),
  createFilter({
    name: 'isNot',
    self: types.string.instance(),
    args: [types.string.instance()] as const,
    label: 'Is not',
    shortString: v =>
      v ? `: ${t('Not {value}', { value: v.value })}` : undefined,
    impl: (self = '', value) => {
      return self.toLowerCase() != value.toLowerCase();
    },
  }),
];
