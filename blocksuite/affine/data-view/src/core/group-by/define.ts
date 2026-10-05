import { t } from '@blocksuite/global/i18n';
import hash from '@emotion/hash';
import {
  addDays,
  differenceInCalendarDays,
  format as fmt,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';

import type { TypeInstance } from '../logical/type.js';
import { t as types } from '../logical/type-presets.js';
import { formatLocalizedDate } from '../utils/date-locale.js';
import { createUniComponentFromWebComponent } from '../utils/uni-component/uni-component.js';
import { BooleanGroupView } from './renderer/boolean-group.js';
import { DateGroupView } from './renderer/date-group.js';
import { NumberGroupView } from './renderer/number-group.js';
import { SelectGroupView } from './renderer/select-group.js';
import { StringGroupView } from './renderer/string-group.js';
import type { GroupByConfig } from './types.js';

export const createGroupByConfig = <
  Data extends Record<string, unknown>,
  MatchType extends TypeInstance,
  GroupValue = unknown,
>(
  config: GroupByConfig<Data, MatchType, GroupValue>
): GroupByConfig => config as never;

export const ungroups = {
  key: 'Ungroups',
  value: null,
};

const WEEK_OPTS_MON = { weekStartsOn: 1 } as const;
const WEEK_OPTS_SUN = { weekStartsOn: 0 } as const;

const formatDay = (date: Date) =>
  formatLocalizedDate(date, 'MMM d yyyy', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
const formatMonth = (date: Date) =>
  formatLocalizedDate(date, 'MMM yyyy', { month: 'short', year: 'numeric' });

const rangeLabel = (a: Date, b: Date) => `${formatDay(a)} – ${formatDay(b)}`;

function buildDateCfg(
  name: string,
  grouper: (ms: number | null) => { key: string; value: number | null }[],
  groupName: (v: number | null) => string
): GroupByConfig {
  return createGroupByConfig({
    name,
    matchType: types.date.instance(),
    groupName: (_t, v) => groupName(v),
    defaultKeys: _t => [ungroups],
    valuesGroup: (v: number | null, _t) => grouper(v),
    addToGroup: (grp: number | null, _old: number | null) => grp,
    view: createUniComponentFromWebComponent(DateGroupView),
  });
}

const dateRelativeCfg = buildDateCfg(
  'date-relative',
  v => {
    if (v == null) return [ungroups];
    const d = startOfDay(new Date(v));
    const today = startOfDay(new Date());
    const daysDiff = differenceInCalendarDays(d, today);

    // Handle specific days
    if (isToday(d)) return [{ key: 'today', value: +d }];
    if (isTomorrow(d)) return [{ key: 'tomorrow', value: +d }];
    if (isYesterday(d)) return [{ key: 'yesterday', value: +d }];

    // Handle future dates
    if (daysDiff > 0) {
      if (daysDiff <= 7) return [{ key: 'next7', value: +d }];
      if (daysDiff <= 30) return [{ key: 'next30', value: +d }];
      // Group by month for future dates beyond 30 days
      const m = startOfMonth(d);
      return [{ key: `${+m}`, value: +m }];
    }

    // Handle past dates
    const daysAgo = -daysDiff;
    if (daysAgo <= 7) return [{ key: 'last7', value: +d }];
    if (daysAgo <= 30) return [{ key: 'last30', value: +d }];
    // Group by month for past dates beyond 30 days
    const m = startOfMonth(d);
    return [{ key: `${+m}`, value: +m }];
  },
  v => {
    if (v == null) return '';
    const d = startOfDay(new Date(v));
    const today = startOfDay(new Date());
    const daysDiff = differenceInCalendarDays(d, today);

    // Handle specific days
    if (isToday(d)) return t('Today');
    if (isTomorrow(d)) return t('Tomorrow');
    if (isYesterday(d)) return t('Yesterday');

    // Handle future dates
    if (daysDiff > 0) {
      if (daysDiff <= 7) return t('Next 7 days');
      if (daysDiff <= 30) return t('Next 30 days');
      // Show month/year for future dates beyond 30 days
      return formatMonth(new Date(v));
    }

    // Handle past dates
    const daysAgo = -daysDiff;
    if (daysAgo <= 7) return t('Last 7 days');
    if (daysAgo <= 30) return t('Last 30 days');
    // Show month/year for past dates beyond 30 days
    return formatMonth(new Date(v));
  }
);

const dateDayCfg = buildDateCfg(
  'date-day',
  v => {
    if (v == null) return [ungroups];
    const d = startOfDay(new Date(v));
    return [{ key: `${+d}`, value: +d }];
  },
  v => (v ? formatDay(new Date(v)) : '')
);

const dateWeekSunCfg = buildDateCfg(
  'date-week-sun',
  v => {
    if (v == null) return [ungroups];
    const w = startOfWeek(new Date(v), WEEK_OPTS_SUN);
    return [{ key: `${+w}`, value: +w }];
  },
  v => (v ? rangeLabel(new Date(v), addDays(new Date(v), 6)) : '')
);

const dateWeekMonCfg = buildDateCfg(
  'date-week-mon',
  v => {
    if (v == null) return [ungroups];
    const w = startOfWeek(new Date(v), WEEK_OPTS_MON);
    return [{ key: `${+w}`, value: +w }];
  },
  v => (v ? rangeLabel(new Date(v), addDays(new Date(v), 6)) : '')
);

const dateMonthCfg = buildDateCfg(
  'date-month',
  v => {
    if (v == null) return [ungroups];
    const m = startOfMonth(new Date(v));
    return [{ key: `${+m}`, value: +m }];
  },
  v => (v ? formatMonth(new Date(v)) : '')
);

const dateYearCfg = buildDateCfg(
  'date-year',
  v => {
    if (v == null) return [ungroups];
    const y = startOfYear(new Date(v));
    return [{ key: `${+y}`, value: +y }];
  },
  v => (v ? fmt(new Date(v), 'yyyy') : '')
);

export const groupByMatchers: GroupByConfig[] = [
  createGroupByConfig({
    name: 'select',
    matchType: types.tag.instance(),
    groupName: (type, value: string | null) => {
      if (types.tag.is(type) && type.data)
        return type.data.find(v => v.id === value)?.value ?? '';
      return '';
    },
    defaultKeys: type =>
      types.tag.is(type) && type.data
        ? [ungroups, ...type.data.map(v => ({ key: v.id, value: v.id }))]
        : [ungroups],
    valuesGroup: (value, _t) =>
      value == null ? [ungroups] : [{ key: `${value}`, value }],
    addToGroup: (v: string | null, _old: string | null) => v,
    view: createUniComponentFromWebComponent(SelectGroupView),
  }),

  createGroupByConfig({
    name: 'multi-select',
    matchType: types.array.instance(types.tag.instance()),
    groupName: (type, value: string | null) => {
      if (
        types.array.is(type) &&
        types.tag.is(type.element) &&
        type.element.data
      )
        return type.element.data.find(v => v.id === value)?.value ?? '';
      return '';
    },
    defaultKeys: type =>
      types.array.is(type) && types.tag.is(type.element) && type.element.data
        ? [
            ungroups,
            ...type.element.data.map(v => ({ key: v.id, value: v.id })),
          ]
        : [ungroups],
    valuesGroup: (value, _t) => {
      if (value == null) return [ungroups];
      if (Array.isArray(value) && value.length)
        return value.map(id => ({ key: `${id}`, value: id }));
      return [ungroups];
    },
    addToGroup: (
      value: string | null,
      old: string[] | null
    ): string[] | null => {
      if (value == null) return old;
      return Array.isArray(old) ? [...old, value] : [value];
    },
    removeFromGroup: (value, old) =>
      Array.isArray(old) ? old.filter(v => v !== value) : old,
    view: createUniComponentFromWebComponent(SelectGroupView),
  }),

  createGroupByConfig({
    name: 'text',
    matchType: types.string.instance(),
    groupName: (_t, v) => `${v ?? ''}`,
    defaultKeys: _t => [ungroups],
    valuesGroup: (v, _t) =>
      typeof v !== 'string' || !v ? [ungroups] : [{ key: hash(v), value: v }],
    addToGroup: (v: string | null, _old: string | null) => v,
    view: createUniComponentFromWebComponent(StringGroupView),
  }),

  createGroupByConfig({
    name: 'number',
    matchType: types.number.instance(),
    groupName: (_t, v) => `${v ?? ''}`,
    defaultKeys: _t => [ungroups],
    valuesGroup: (v, _t) =>
      typeof v !== 'number'
        ? [ungroups]
        : [{ key: `g:${Math.floor(v / 10)}`, value: Math.floor(v / 10) }],
    addToGroup: (v: number | null, _old: number | null) =>
      typeof v === 'number' ? v * 10 : null,
    view: createUniComponentFromWebComponent(NumberGroupView),
  }),

  createGroupByConfig({
    name: 'boolean',
    matchType: types.boolean.instance(),
    groupName: (_t, v) => `${v?.toString() ?? ''}`,
    defaultKeys: _t => [
      { key: 'true', value: true },
      { key: 'false', value: false },
    ],
    valuesGroup: (v, _t) =>
      typeof v !== 'boolean'
        ? [{ key: 'false', value: false }]
        : [{ key: v.toString(), value: v }],
    addToGroup: (v: boolean | null, _old: boolean | null) => v,
    view: createUniComponentFromWebComponent(BooleanGroupView),
  }),

  dateRelativeCfg,
  dateDayCfg,
  dateWeekSunCfg,
  dateWeekMonCfg,
  dateMonthCfg,
  dateYearCfg,
];
