import { format } from 'date-fns/format';

/**
 * Locale for dates written with month or weekday names: the document
 * language (`<html lang>`) when it is not English, otherwise `undefined`
 * so English keeps its current output. Digits stay Latin, like the numeric
 * dates shown in cells.
 */
export const dateLocale = (): string | undefined => {
  const lang =
    typeof document === 'undefined' ? '' : document.documentElement.lang;
  if (!lang || lang.toLowerCase().startsWith('en')) {
    return undefined;
  }
  return `${lang}-u-nu-latn`;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A cached `Intl.DateTimeFormat` for the document language. */
export const dateTimeFormat = (options: Intl.DateTimeFormatOptions) => {
  const locale = dateLocale();
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
};

/**
 * Formats a date with a date-fns pattern in English, or with the equivalent
 * `Intl` options in the document language.
 */
export const formatLocalizedDate = (
  date: Date | number,
  englishPattern: string,
  options: Intl.DateTimeFormatOptions
) => {
  if (!dateLocale()) {
    return format(date, englishPattern);
  }
  return dateTimeFormat(options).format(date);
};
