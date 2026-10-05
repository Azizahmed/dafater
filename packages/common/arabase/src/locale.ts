import { baseLanguage } from './direction';

/**
 * Finds the supported locale matching `candidate`: an exact (case-insensitive)
 * match first, then the base language (`ar-EG` → `ar`).
 */
export function matchLocale(
  candidate: string | null | undefined,
  supported: readonly string[]
): string | null {
  if (!candidate) return null;
  const lower = candidate.toLowerCase();
  const exact = supported.find(locale => locale.toLowerCase() === lower);
  if (exact) return exact;
  const base = baseLanguage(candidate);
  return supported.find(locale => locale.toLowerCase() === base) ?? null;
}

export interface ResolveLocaleOptions {
  /** Locales offered by the product, in any order. */
  supportedLocales: readonly string[];
  /** Locale used by fresh installs (no stored choice). */
  defaultLocale: string;
}

/**
 * Picks the locale to render with. The user's stored choice always wins;
 * otherwise the product default is used. Browser languages are deliberately
 * ignored: the product language is a product decision, not a guess.
 */
export function resolveLocale(
  stored: readonly (string | null | undefined)[],
  { supportedLocales, defaultLocale }: ResolveLocaleOptions
): string {
  for (const candidate of stored) {
    const match = matchLocale(candidate, supportedLocales);
    if (match) return match;
  }
  return defaultLocale;
}
